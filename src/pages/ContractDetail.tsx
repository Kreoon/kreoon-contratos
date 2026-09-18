import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Copy,
  Download,
  Clock,
  ExternalLink,
  Mail,
  RefreshCw,
  Shield,
  Pencil,
  Save,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContractStatusBadge } from "@/components/contracts/ContractStatusBadge";
import { PaymentSchedule } from "@/components/contracts/PaymentSchedule";
import { RichTextEditor } from "@/components/contracts/RichTextEditor";
import type {
  Contract,
  AuditEntry,
  Signature,
  ContractStatus,
} from "@/lib/types";
import { injectContractBranding } from "@/lib/template-engine";
import { getIssuer } from "@/lib/organizer";
import {
  downloadSignedPdf,
  generateAndStoreSignedPdf,
  invokeFunction,
  isStoredPdf,
} from "@/lib/pdf";

// Espejo de MARCA_VALOR_PENDIENTE en feria_effix_interno/src/lib/contratos/ponentes.ts:
// los contratos del modelo 1 de ponentes llegan con este texto en honorarios,
// moneda y forma de pago. Si se cambia allá, hay que cambiarlo acá.
const MARCA_VALOR_PENDIENTE = "[VALOR A COMPLETAR POR EL EQUIPO]";

export function ContractDetail() {
  const { id } = useParams<{ id: string }>();
  const [contract, setContract] = useState<Contract | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [signature, setSignature] = useState<Signature | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [resendingCopy, setResendingCopy] = useState(false);
  const [regeneratingPdf, setRegeneratingPdf] = useState(false);
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [editedHtml, setEditedHtml] = useState("");
  const [savingHtml, setSavingHtml] = useState(false);

  useEffect(() => {
    if (!id) return;
    async function load() {
      const [contractRes, auditRes, sigRes] = await Promise.all([
        supabase
          .from("contracts")
          .select("*, template:contract_templates(name)")
          .eq("id", id)
          .single(),
        supabase
          .from("audit_trail")
          .select("*")
          .eq("contract_id", id)
          .order("created_at", { ascending: true }),
        supabase
          .from("signatures")
          .select("*")
          .eq("contract_id", id)
          .maybeSingle(),
      ]);
      if (contractRes.data) setContract(contractRes.data as Contract);
      if (auditRes.data) setAuditEntries(auditRes.data as AuditEntry[]);
      if (sigRes.data) setSignature(sigRes.data as Signature);
      setLoading(false);
    }
    load();
  }, [id]);

  const signingUrl = contract
    ? `${window.location.origin}/sign/${contract.signing_token}`
    : "";

  const copyLink = () => {
    // Copiar el enlace es otra forma de enviarlo: mismo bloqueo que el correo.
    // "Abrir" sí queda libre, porque es la vista previa del equipo.
    if (tieneValoresPendientes) {
      toast.error("Completa los valores pendientes antes de compartir el link");
      return;
    }
    navigator.clipboard.writeText(signingUrl);
    toast.success("Link copiado al portapapeles");
  };

  // Solo se puede editar el contenido antes de firmar: el hash legal se calcula
  // sobre rendered_html al firmar, así que editar tras la firma la invalidaría.
  const canEdit =
    !!contract && ["draft", "sent", "viewed"].includes(contract.status);

  // Se mira el HTML GUARDADO, no el que se está editando: es el que viaja al
  // firmante. Mientras quede la marca, el contrato no se puede enviar.
  const tieneValoresPendientes = !!contract?.rendered_html?.includes(
    MARCA_VALOR_PENDIENTE,
  );

  const startEditing = () => {
    if (!contract) return;
    setEditedHtml(contract.rendered_html || "");
    setMode("edit");
  };

  const cancelEditing = () => {
    setMode("preview");
  };

  const saveContent = async () => {
    if (!contract) return;
    setSavingHtml(true);
    try {
      const { error } = await supabase
        .from("contracts")
        .update({ rendered_html: editedHtml })
        .eq("id", contract.id);
      if (error) throw error;
      setContract((prev) =>
        prev ? { ...prev, rendered_html: editedHtml } : null,
      );
      setMode("preview");
      toast.success("Contenido del contrato guardado");
    } catch {
      toast.error("Error al guardar el contenido");
    } finally {
      setSavingHtml(false);
    }
  };

  const actionLabels: Record<string, string> = {
    created: "Contrato creado",
    sent: "Contrato enviado",
    viewed: "Contrato visto por firmante",
    signed: "Contrato firmado",
    downloaded: "PDF descargado",
    email_sent: "Email enviado",
  };

  const sendSigningEmail = async () => {
    if (!contract) return;
    if (tieneValoresPendientes) {
      toast.error("El contrato tiene valores sin completar", {
        description:
          "Edítalo y reemplaza los valores pendientes antes de enviarlo.",
      });
      return;
    }
    setSendingEmail(true);
    try {
      const { error } = await supabase.functions.invoke("send-contract", {
        body: {
          contractId: contract.id,
          signerEmail: contract.signer_email,
          signerName: contract.signer_name,
          signingUrl: `${window.location.origin}/sign/${contract.signing_token}`,
          contractTitle: contract.title,
        },
      });
      if (error) throw error;

      // Marcar como enviado si estaba en draft
      if (contract.status === "draft") {
        await supabase
          .from("contracts")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", contract.id);
        setContract((prev) =>
          prev
            ? {
                ...prev,
                status: "sent" as ContractStatus,
                sent_at: new Date().toISOString(),
              }
            : null,
        );
      }

      toast.success("Email de firma enviado");
    } catch {
      toast.error("Error enviando email");
    } finally {
      setSendingEmail(false);
    }
  };

  /** Refresca el contrato desde la base tras regenerar el PDF. */
  const reloadContract = async () => {
    if (!contract) return;
    const { data: updated } = await supabase
      .from("contracts")
      .select("*, template:contract_templates(name)")
      .eq("id", contract.id)
      .single();
    if (updated) setContract(updated as Contract);
  };

  const generatePdf = async () => {
    if (!contract) return;
    setRegeneratingPdf(true);
    try {
      await generateAndStoreSignedPdf(contract.id, { download: true });
      await reloadContract();
      toast.success("PDF generado y descargado");
    } catch (err) {
      toast.error("Error generando PDF", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setRegeneratingPdf(false);
    }
  };

  const downloadPdf = async () => {
    if (!contract) return;
    setRegeneratingPdf(true);
    try {
      await downloadSignedPdf(
        contract.id,
        contract.signed_pdf_url,
        contract.title,
      );
      if (!isStoredPdf(contract.signed_pdf_url)) await reloadContract();
    } catch (err) {
      toast.error("Error descargando el PDF", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setRegeneratingPdf(false);
    }
  };

  const resendSignedCopy = async () => {
    if (!contract) return;
    setResendingCopy(true);
    try {
      // El email lleva el PDF adjunto: si aún no existe, se genera primero
      if (!isStoredPdf(contract.signed_pdf_url)) {
        setRegeneratingPdf(true);
        await generateAndStoreSignedPdf(contract.id);
        setRegeneratingPdf(false);
        await reloadContract();
      }
      await invokeFunction("send-signed-copy", { contractId: contract.id });
      toast.success("Copia firmada enviada por email");
    } catch (err) {
      toast.error("Error enviando copia firmada", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setResendingCopy(false);
      setRegeneratingPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[hsl(var(--primary))]" />
      </div>
    );
  }

  if (!contract) {
    return <div className="text-center py-12">Contrato no encontrado</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/contracts">
          <Button variant="ghost" size="icon" aria-label="Volver a contratos">
            <ArrowLeft size={18} />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{contract.title}</h1>
          <p className="text-[hsl(var(--muted-foreground))]">
            {(contract.template as { name?: string } | undefined)?.name}
          </p>
        </div>
        <ContractStatusBadge status={contract.status} />
      </div>

      {tieneValoresPendientes && canEdit && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <AlertTriangle
              size={18}
              className="mt-0.5 shrink-0 text-amber-700"
            />
            <div className="space-y-1">
              <p className="font-medium text-amber-900">
                Este contrato tiene valores sin completar: edítalo antes de
                enviarlo.
              </p>
              <p className="text-amber-800">
                Busca el texto «{MARCA_VALOR_PENDIENTE}» (honorarios, moneda y
                forma de pago) y reemplázalo con los valores acordados. El envío
                por email queda bloqueado hasta guardarlo.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna izquierda: info + acciones */}
        <div className="space-y-6">
          {/* Info del firmante */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Firmante</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <span className="text-[hsl(var(--muted-foreground))]">
                  Nombre:{" "}
                </span>
                {contract.signer_name}
              </div>
              <div>
                <span className="text-[hsl(var(--muted-foreground))]">
                  Email:{" "}
                </span>
                {contract.signer_email}
              </div>
              {contract.signer_document_id && (
                <div>
                  <span className="text-[hsl(var(--muted-foreground))]">
                    Documento:{" "}
                  </span>
                  {contract.signer_document_id}
                </div>
              )}
              {contract.signer_company && (
                <div>
                  <span className="text-[hsl(var(--muted-foreground))]">
                    Empresa:{" "}
                  </span>
                  {contract.signer_company}
                </div>
              )}
              <div className="pt-2 border-t">
                <span className="text-[hsl(var(--muted-foreground))]">
                  Emitido por:{" "}
                </span>
                {getIssuer(contract.issuer_id).empresa} · NIT{" "}
                {getIssuer(contract.issuer_id).nit}
              </div>
            </CardContent>
          </Card>

          {/* Link de firma */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Link de Firma</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <code className="flex-1 text-xs bg-[hsl(var(--secondary))] p-2 rounded overflow-hidden text-ellipsis whitespace-nowrap">
                  {signingUrl}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copyLink}
                  aria-label="Copiar link de firma"
                >
                  <Copy size={14} />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {["draft", "sent", "viewed"].includes(contract.status) && (
                  <Button
                    size="sm"
                    onClick={sendSigningEmail}
                    disabled={sendingEmail || tieneValoresPendientes}
                    title={
                      tieneValoresPendientes
                        ? "Completa los valores pendientes antes de enviarlo"
                        : undefined
                    }
                  >
                    {sendingEmail ? (
                      <>
                        <RefreshCw size={14} className="mr-1 animate-spin" />{" "}
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Mail size={14} className="mr-1" />{" "}
                        {contract.status === "draft"
                          ? "Enviar por Email"
                          : "Reenviar Email"}
                      </>
                    )}
                  </Button>
                )}
                {["signed", "completed"].includes(contract.status) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={resendSignedCopy}
                    disabled={resendingCopy}
                  >
                    {resendingCopy ? (
                      <>
                        <RefreshCw size={14} className="mr-1 animate-spin" />{" "}
                        {regeneratingPdf ? "Generando PDF..." : "Enviando..."}
                      </>
                    ) : (
                      <>
                        <Mail size={14} className="mr-1" /> Reenviar Copia
                        Firmada
                      </>
                    )}
                  </Button>
                )}
                <a href={signingUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm">
                    <ExternalLink size={14} className="mr-1" />
                    Abrir
                  </Button>
                </a>
              </div>
              {contract.token_expires_at && (
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Expira:{" "}
                  {new Date(contract.token_expires_at).toLocaleDateString(
                    "es-CO",
                  )}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Payment Schedule */}
          <PaymentSchedule
            contractId={contract.id}
            moneda={(contract.contract_data?.moneda as string) || "COP"}
          />

          {/* Certificado de firma completo */}
          {signature && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield size={16} /> Certificado de Firma
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {/* Firma visual */}
                {signature.signature_image_url && (
                  <div className="border rounded-lg p-4 bg-white text-center">
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mb-2">
                      Firma electrónica
                    </p>
                    <img
                      src={signature.signature_image_url}
                      alt="Firma del contrato"
                      className="mx-auto max-h-20"
                    />
                  </div>
                )}
                {signature.signature_type === "typed" &&
                  signature.typed_name && (
                    <div className="border rounded-lg p-4 bg-white text-center">
                      <p className="text-xs text-[hsl(var(--muted-foreground))] mb-2">
                        Firma tipada
                      </p>
                      <p
                        className="text-2xl italic"
                        style={{ fontFamily: "'Brush Script MT', cursive" }}
                      >
                        {signature.typed_name}
                      </p>
                    </div>
                  )}

                {/* Datos de la firma */}
                <div className="grid grid-cols-2 gap-3 bg-[hsl(var(--secondary))] rounded-lg p-4">
                  <div>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Tipo de firma
                    </p>
                    <p className="font-medium">
                      {signature.signature_type === "drawn"
                        ? "Dibujada"
                        : "Tipada"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Fecha y hora
                    </p>
                    <p className="font-medium">
                      {new Date(signature.consent_accepted_at).toLocaleString(
                        "es-CO",
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Dirección IP
                    </p>
                    <p className="font-medium font-mono">
                      {signature.ip_address ?? "No disponible"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      User Agent
                    </p>
                    <p className="font-medium text-xs break-all">
                      {signature.user_agent?.slice(0, 80)}...
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Navegador
                    </p>
                    <p className="font-medium">
                      {signature.device_info?.browser || "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Sistema operativo
                    </p>
                    <p className="font-medium">
                      {signature.device_info?.os || "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Dispositivo
                    </p>
                    <p className="font-medium">
                      {signature.device_info?.device_type || "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Pantalla
                    </p>
                    <p className="font-medium">
                      {signature.device_info?.screen || "N/A"}
                    </p>
                  </div>
                  {signature.geolocation?.lat && (
                    <>
                      <div>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">
                          Geolocalización
                        </p>
                        <p className="font-medium font-mono text-xs">
                          {signature.geolocation.lat},{" "}
                          {signature.geolocation.lng}
                        </p>
                      </div>
                      {signature.geolocation.city && (
                        <div>
                          <p className="text-xs text-[hsl(var(--muted-foreground))]">
                            Ciudad
                          </p>
                          <p className="font-medium">
                            {signature.geolocation.city},{" "}
                            {signature.geolocation.country}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Documento de identidad */}
                {(signature.id_document_image_url ||
                  signature.id_document_back_image_url) && (
                  <div>
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mb-2">
                      Documento de identidad
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {signature.id_document_image_url && (
                        <div className="border rounded-lg overflow-hidden">
                          <p className="text-xs text-center text-[hsl(var(--muted-foreground))] bg-[hsl(var(--secondary))] py-1">
                            Frontal
                          </p>
                          <a
                            href={signature.id_document_image_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <img
                              src={signature.id_document_image_url}
                              alt="Documento frontal"
                              className="max-h-40 cursor-pointer hover:opacity-90"
                            />
                          </a>
                        </div>
                      )}
                      {signature.id_document_back_image_url && (
                        <div className="border rounded-lg overflow-hidden">
                          <p className="text-xs text-center text-[hsl(var(--muted-foreground))] bg-[hsl(var(--secondary))] py-1">
                            Posterior
                          </p>
                          <a
                            href={signature.id_document_back_image_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <img
                              src={signature.id_document_back_image_url}
                              alt="Documento posterior"
                              className="max-h-40 cursor-pointer hover:opacity-90"
                            />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Hashes */}
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Hash del documento (SHA-256)
                    </p>
                    <code className="block text-xs bg-[hsl(var(--secondary))] p-2 rounded break-all font-mono">
                      {signature.document_hash}
                    </code>
                  </div>
                  <div>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Hash de la firma (SHA-256)
                    </p>
                    <code className="block text-xs bg-[hsl(var(--secondary))] p-2 rounded break-all font-mono">
                      {signature.signature_hash}
                    </code>
                  </div>
                </div>

                {/* Consentimiento */}
                <div className="border-t pt-3">
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mb-1">
                    Consentimiento otorgado
                  </p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] italic">
                    {signature.consent_text}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Audit trail */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Historial</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {auditEntries.map((entry) => (
                  <div key={entry.id} className="flex gap-3 text-sm">
                    <Clock
                      size={14}
                      className="mt-0.5 shrink-0 text-[hsl(var(--muted-foreground))]"
                    />
                    <div>
                      <p className="font-medium">
                        {actionLabels[entry.action] || entry.action}
                      </p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        {new Date(entry.created_at).toLocaleString("es-CO")}
                        {entry.actor_email && ` · ${entry.actor_email}`}
                        {entry.ip_address && ` · IP: ${entry.ip_address}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Columna derecha: preview del contrato */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-base">Contrato</CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  {mode === "edit" ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={cancelEditing}
                        disabled={savingHtml}
                      >
                        <X size={14} className="mr-1" /> Cancelar
                      </Button>
                      <Button
                        size="sm"
                        onClick={saveContent}
                        disabled={savingHtml}
                      >
                        {savingHtml ? (
                          <>
                            <RefreshCw
                              size={14}
                              className="mr-1 animate-spin"
                            />{" "}
                            Guardando...
                          </>
                        ) : (
                          <>
                            <Save size={14} className="mr-1" /> Guardar
                          </>
                        )}
                      </Button>
                    </>
                  ) : (
                    <>
                      {canEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={startEditing}
                        >
                          <Pencil size={14} className="mr-1" /> Editar
                        </Button>
                      )}
                      {["signed", "completed"].includes(contract.status) ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={downloadPdf}
                            disabled={regeneratingPdf}
                          >
                            {regeneratingPdf ? (
                              <>
                                <RefreshCw
                                  size={14}
                                  className="mr-1 animate-spin"
                                />{" "}
                                Preparando PDF...
                              </>
                            ) : (
                              <>
                                <Download size={14} className="mr-1" />{" "}
                                Descargar PDF
                              </>
                            )}
                          </Button>
                          {isStoredPdf(contract.signed_pdf_url) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={generatePdf}
                              disabled={regeneratingPdf}
                              title="Vuelve a generar el PDF con el contenido actual"
                            >
                              <RefreshCw size={14} className="mr-1" /> Regenerar
                            </Button>
                          )}
                        </>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {mode === "edit" ? (
                <div className="space-y-2">
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Editas solo este contrato. El encabezado y el pie de página
                    se agregan automáticamente al mostrarlo y al generar el PDF.
                  </p>
                  <RichTextEditor value={editedHtml} onChange={setEditedHtml} />
                </div>
              ) : (
                <div
                  className="prose prose-sm max-w-none border rounded-md p-6 bg-white text-black overflow-auto max-h-[80vh]"
                  dangerouslySetInnerHTML={{
                    __html: injectContractBranding(
                      contract.rendered_html || "",
                    ),
                  }}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
