import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Search,
  UserPlus,
  UserCheck,
  X,
  Pencil,
  RotateCcw,
  Eye,
} from "lucide-react";
import { useTemplates } from "@/hooks/useTemplates";
import { supabase } from "@/lib/supabase";
import { renderTemplate } from "@/lib/template-engine";
import {
  ISSUERS,
  DEFAULT_ISSUER_ID,
  getIssuer,
  issuerToTemplateData,
  type IssuerId,
} from "@/lib/organizer";
import { COUNTRIES } from "@/lib/countries";
import { getDepartments, getCities, hasLocationData } from "@/lib/locations";
import { moneyToWords } from "@/lib/number-to-words";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RichTextEditor } from "@/components/contracts/RichTextEditor";
import type { ContractTemplate, TemplateVariable, Contact } from "@/lib/types";

export function ContractNew() {
  const { templates, loading: loadingTemplates } = useTemplates();
  const [selectedTemplate, setSelectedTemplate] =
    useState<ContractTemplate | null>(null);
  // Empresa emisora (razón social) con la que se genera el contrato. Es estado
  // independiente de formData para que cambiar de plantilla no lo resetee.
  const [issuerId, setIssuerId] = useState<IssuerId>(DEFAULT_ISSUER_ID);
  const issuer = getIssuer(issuerId);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signerDocId, setSignerDocId] = useState("");
  const [signerCompany, setSignerCompany] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  // Edición manual del contrato: null = usa el HTML derivado de la plantilla.
  // Al editar manualmente, este valor tiene prioridad y se guarda en este contrato.
  const [editedHtml, setEditedHtml] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const navigate = useNavigate();

  // --- Cuotas de pago ---
  interface Cuota {
    descripcion: string;
    monto: string;
    fecha: string;
  }
  const [numCuotas, setNumCuotas] = useState(0);
  const [cuotas, setCuotas] = useState<Cuota[]>([]);

  const handleNumCuotasChange = (n: number) => {
    setNumCuotas(n);
    const newCuotas: Cuota[] = [];
    for (let i = 0; i < n; i++) {
      newCuotas.push(
        cuotas[i] || {
          descripcion:
            i === 0
              ? "Anticipo"
              : i === n - 1
                ? "Saldo final"
                : `Cuota ${i + 1}`,
          monto: "",
          fecha: "",
        },
      );
    }
    setCuotas(newCuotas);
  };

  const updateCuota = (index: number, field: keyof Cuota, value: string) => {
    setCuotas((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)),
    );
  };

  // --- Contact selector state ---
  const [contactSearch, setContactSearch] = useState("");
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const [showContactSearch, setShowContactSearch] = useState(false);

  // Buscar contactos existentes
  const searchContacts = useCallback(async (query: string) => {
    if (query.length < 2) {
      setContactResults([]);
      return;
    }
    setSearchingContacts(true);
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .or(
        `nombre_completo.ilike.%${query}%,empresa.ilike.%${query}%,email.ilike.%${query}%,numero_documento.ilike.%${query}%,id_fiscal.ilike.%${query}%,representante_legal.ilike.%${query}%`,
      )
      .limit(8);
    setContactResults((data || []) as Contact[]);
    setSearchingContacts(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (contactSearch) searchContacts(contactSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [contactSearch, searchContacts]);

  // Cuando selecciona un contacto existente, rellenar el formulario
  const selectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setShowContactSearch(false);
    setContactSearch("");

    const newData: Record<string, string> = { ...formData };

    if (contact.tipo_persona === "natural") {
      newData.tipo_persona = "Persona Natural";
      if (contact.nombre_completo)
        newData.nombre_completo = contact.nombre_completo;
      if (contact.tipo_documento)
        newData.tipo_documento = contact.tipo_documento;
      if (contact.numero_documento)
        newData.numero_documento = contact.numero_documento;
    } else {
      newData.tipo_persona = "Persona Jurídica";
      if (contact.empresa) newData.empresa = contact.empresa;
      if (contact.id_fiscal) newData.id_fiscal = contact.id_fiscal;
      if (contact.sigla) newData.sigla = contact.sigla;
      if (contact.representante_legal)
        newData.representante_legal = contact.representante_legal;
      if (contact.tipo_documento_representante)
        newData.tipo_documento_representante =
          contact.tipo_documento_representante;
      if (contact.numero_documento_representante)
        newData.numero_documento_representante =
          contact.numero_documento_representante;
    }

    if (contact.email) {
      newData.email = contact.email;
      newData.email_contratista = contact.email;
    }
    if (contact.telefono) newData.telefono = contact.telefono;
    if (contact.celular) newData.celular = contact.celular;
    // Las plantillas usan {{telefono_contratista}}: se toma el fijo y, si no
    // hay, el celular.
    const telefonoContacto = contact.telefono || contact.celular;
    if (telefonoContacto) newData.telefono_contratista = telefonoContacto;
    if (contact.direccion) newData.direccion = contact.direccion;
    if (contact.ciudad) newData.ciudad = contact.ciudad;
    if (contact.departamento) newData.departamento = contact.departamento;
    if (contact.pais) newData.pais = contact.pais;
    if (contact.web_redes) newData.web_redes = contact.web_redes;
    if (contact.persona_encargada)
      newData.persona_encargada = contact.persona_encargada;
    if (contact.email_encargada)
      newData.email_encargada = contact.email_encargada;
    if (contact.celular_encargada)
      newData.celular_encargada = contact.celular_encargada;

    setFormData(newData);
  };

  const clearContact = () => {
    setSelectedContact(null);
    setFormData((prev) => {
      const cleaned = { ...prev };
      // Keep only template-specific fields (not contact fields)
      const contactKeys = [
        "tipo_persona",
        "nombre_completo",
        "tipo_documento",
        "numero_documento",
        "empresa",
        "id_fiscal",
        "sigla",
        "representante_legal",
        "tipo_documento_representante",
        "numero_documento_representante",
        "email",
        "email_contratista",
        "telefono",
        "telefono_contratista",
        "celular",
        "direccion",
        "ciudad",
        "departamento",
        "pais",
        "web_redes",
        "persona_encargada",
        "email_encargada",
        "celular_encargada",
      ];
      contactKeys.forEach((k) => delete cleaned[k]);
      return cleaned;
    });
  };

  // Auto-extraer datos del firmante desde las variables del contrato
  useEffect(() => {
    if (formData.tipo_persona === "Persona Natural") {
      if (formData.nombre_completo) setSignerName(formData.nombre_completo);
      if (formData.numero_documento) setSignerDocId(formData.numero_documento);
      setSignerCompany("");
    } else if (formData.tipo_persona === "Persona Jurídica") {
      if (formData.representante_legal)
        setSignerName(formData.representante_legal);
      if (formData.empresa) setSignerCompany(formData.empresa);
      if (formData.id_fiscal) setSignerDocId(formData.id_fiscal);
    }
    const emailKey = formData.email || formData.email_contratista || "";
    if (emailKey) setSignerEmail(emailKey);
  }, [formData]);

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    setSelectedTemplate(template || null);
    // Nueva plantilla: descartar cualquier edición manual previa
    setEditedHtml(null);
    setEditMode(false);
    if (!selectedContact)
      setFormData({ anio: new Date().getFullYear().toString() });
    else
      setFormData((prev) => ({
        ...prev,
        anio: new Date().getFullYear().toString(),
      }));
  };

  const handleFieldChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleIssuerChange = (value: string) => {
    const next = ISSUERS.find((i) => i.id === value);
    if (!next || next.id === issuerId) return;
    // Con una edición manual activa, el HTML editado conserva la empresa
    // anterior: hay que descartarlo para que el contrato refleje la nueva.
    if (editedHtml !== null) {
      const ok = window.confirm(
        "Tienes una edición manual del contrato. Cambiar la empresa emisora descarta esa edición y regenera el texto desde la plantilla. ¿Continuar?",
      );
      if (!ok) return;
      setEditedHtml(null);
      setEditMode(false);
    }
    setIssuerId(next.id);
  };

  // Generar texto de forma de pago desde cuotas
  const formaPagoFromCuotas =
    cuotas.length > 0
      ? cuotas
          .map((c, i) => {
            const moneda = formData.moneda || "COP";
            const monto = c.monto
              ? new Intl.NumberFormat("es-CO").format(Number(c.monto))
              : "___";
            const fecha = c.fecha
              ? new Date(c.fecha + "T12:00:00").toLocaleDateString("es-CO")
              : "___";
            return `${c.descripcion || `Cuota ${i + 1}`}: ${moneda} $${monto} - Fecha límite: ${fecha}`;
          })
          .join(". ")
      : "";

  // Formatear monto como moneda
  const mon = formData.moneda || "COP";
  const fmtMoney = (val: string) => {
    const num = parseFloat(val.replace(/[.,\s]/g, ""));
    if (isNaN(num)) return val;
    return "$" + new Intl.NumberFormat("es-CO").format(num);
  };

  const rawTotal = formData.valor_total || formData.honorarios || "";
  const fmtTotal = rawTotal ? fmtMoney(rawTotal) : "";
  const rawAbono = cuotas.length > 0 && cuotas[0].monto ? cuotas[0].monto : "";
  const fmtAbono = rawAbono ? fmtMoney(rawAbono) : "";

  const templateData: Record<string, unknown> = {
    ...formData,
    // Datos de la empresa emisora (org_*). Van después de formData porque son
    // automáticos: la empresa elegida siempre gana aunque una plantilla
    // declare variables org_* editables.
    ...issuerToTemplateData(issuer),
    // Montos formateados para el contrato
    ...(rawTotal
      ? {
          valor_total: `${fmtTotal} ${mon}`,
          honorarios: `${fmtTotal} ${mon}`,
          valor_stand: `${fmtTotal} ${mon}`,
          valor_patrocinio: `${fmtTotal} ${mon}`,
        }
      : {}),
    ...(rawAbono ? { valor_abono: `${fmtAbono} ${mon}` } : {}),
    // Auto-generar valor en letras
    ...(() => {
      const letras = rawTotal ? moneyToWords(rawTotal, mon) : "";
      return letras
        ? {
            honorarios_letras: letras,
            valor_stand_letras: letras,
            valor_patrocinio_letras: letras,
          }
        : {};
    })(),
    // Inyectar forma de pago generada desde cuotas
    ...(formaPagoFromCuotas ? { forma_pago: formaPagoFromCuotas } : {}),
    // Stand custom
    ...(formData.tamano_stand === "__custom" && formData._stand_m2
      ? {
          tamano_stand: `${formData._stand_m2} m² (${formData._stand_medidas || "medida especial"}${formData._stand_tipo ? ` - ${formData._stand_tipo}` : ""})`,
        }
      : {}),
    cuotas: cuotas.filter((c) => c.monto && c.fecha),
  };
  const renderedHtml = selectedTemplate
    ? renderTemplate(
        selectedTemplate.content,
        templateData as Record<string, string>,
      )
    : "";

  // HTML final del contrato: la edición manual (si existe) tiene prioridad
  // sobre el HTML derivado de la plantilla.
  const finalHtml = editedHtml ?? renderedHtml;

  // Campos que se gestionan en secciones especiales, no en "Datos del Contrato"
  const paymentKeys = [
    "valor_total",
    "valor_abono",
    "moneda",
    "forma_pago",
    "honorarios",
    "honorarios_letras",
    "valor_stand",
    "valor_stand_letras",
    "valor_patrocinio",
    "valor_patrocinio_letras",
  ];
  const standKeys = ["tamano_stand", "pabellon", "numero_stand", "ubicacion"];
  // Todos los campos de identidad + contacto + evento: se gestionan en secciones especiales
  const contactAndIdentityKeys = [
    // Identidad
    "tipo_persona",
    "nombre_completo",
    "tipo_documento",
    "numero_documento",
    "empresa",
    "id_fiscal",
    "sigla",
    "representante_legal",
    "tipo_documento_representante",
    "numero_documento_representante",
    // Contacto
    "direccion",
    "ciudad",
    "departamento",
    "pais",
    "telefono",
    "celular",
    "email",
    "email_contratista",
    "telefono_contratista",
    "web_redes",
    "persona_encargada",
    "email_encargada",
    "celular_encargada",
    // Evento (va en la primera sección)
    "anio",
    // Patrocinio (va en sección contacto)
    "tipo_patrocinio",
  ];

  // La persona encargada solo se pide si la plantilla la imprime: la mayoría de
  // contratos no la usan y el formulario ya es largo.
  const usesEncargada =
    selectedTemplate?.variables.some((v) =>
      ["persona_encargada", "email_encargada", "celular_encargada"].includes(
        v.key,
      ),
    ) ?? false;

  const visibleVariables =
    selectedTemplate?.variables.filter((v) => {
      if (paymentKeys.includes(v.key)) return false;
      if (standKeys.includes(v.key)) return false;
      if (contactAndIdentityKeys.includes(v.key)) return false;
      return true;
    }) ?? [];

  const handleSave = async (andSend: boolean) => {
    if (!selectedTemplate) return;

    const missing = visibleVariables
      .filter((v) => v.required && !formData[v.key])
      .map((v) => v.label);
    if (missing.length > 0) {
      toast.error("Campos requeridos faltantes", {
        description: missing.join(", "),
      });
      return;
    }

    setSaving(true);

    // 1. Upsert contacto en CRM (buscar o crear por documento)
    let contactId = selectedContact?.id || null;

    if (!contactId) {
      const tipoPersona =
        formData.tipo_persona === "Persona Jurídica" ? "juridica" : "natural";
      const { data: contactIdResult, error: contactError } = await supabase.rpc(
        "upsert_contact",
        {
          p_tipo_persona: tipoPersona,
          p_nombre_completo: formData.nombre_completo || null,
          p_tipo_documento: formData.tipo_documento || null,
          p_numero_documento: formData.numero_documento || null,
          p_empresa: formData.empresa || null,
          p_id_fiscal: formData.id_fiscal || null,
          p_sigla: formData.sigla || null,
          p_representante_legal: formData.representante_legal || null,
          p_tipo_documento_representante:
            formData.tipo_documento_representante || null,
          p_numero_documento_representante:
            formData.numero_documento_representante || null,
          p_email: formData.email || formData.email_contratista || null,
          p_telefono: formData.telefono || null,
          p_celular: formData.celular || null,
          p_direccion: formData.direccion || null,
          p_ciudad: formData.ciudad || null,
          p_departamento: formData.departamento || null,
          p_pais: formData.pais || "Colombia",
          p_web_redes: formData.web_redes || null,
          p_persona_encargada: formData.persona_encargada || null,
          p_email_encargada: formData.email_encargada || null,
          p_celular_encargada: formData.celular_encargada || null,
          p_fuente: "feria_effix_2026",
        },
      );

      if (contactError) {
        console.warn("Error creando contacto:", contactError.message);
      } else {
        contactId = contactIdResult;
      }
    }

    // 2. Crear contrato vinculado al contacto
    const title = `${selectedTemplate.name} - ${signerName}`;

    const { data, error } = await supabase
      .from("contracts")
      .insert({
        template_id: selectedTemplate.id,
        contact_id: contactId,
        issuer_id: issuerId,
        title,
        signer_name: signerName,
        signer_email: signerEmail,
        signer_document_id: signerDocId || null,
        signer_company: signerCompany || null,
        contract_data: { ...templateData },
        rendered_html: finalHtml,
        status: andSend ? "sent" : "draft",
        token_expires_at: null,
        sent_at: andSend ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (error) {
      toast.error("Error al guardar", { description: error.message });
      setSaving(false);
      return;
    }

    // Enviar email primero si se solicitó
    if (andSend) {
      await supabase.functions.invoke("send-contract", {
        body: {
          contractId: data.id,
          signerEmail,
          signerName,
          signingUrl: `${window.location.origin}/sign/${data.signing_token}`,
          contractTitle: title,
        },
      });
    }

    // Audit trail (no bloquear si falla). Con await: un insert de supabase-js
    // sin await ni .then() nunca sale, y por eso hasta 2026-09-19 la auditoría
    // no tenía ningún "created" ni "sent" hechos desde acá.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("audit_trail").insert({
      contract_id: data.id,
      action: "created",
      actor_type: "admin",
      actor_email: user?.email,
    });
    if (andSend) {
      await supabase.from("audit_trail").insert({
        contract_id: data.id,
        action: "sent",
        actor_type: "admin",
        actor_email: user?.email,
        metadata: { signer_email: signerEmail },
      });
    }

    // 4. Guardar cuotas de pago
    if (cuotas.length > 0) {
      const installments = cuotas
        .filter((c) => c.monto && c.fecha)
        .map((c, i) => ({
          contract_id: data.id,
          numero_cuota: i + 1,
          descripcion: c.descripcion || `Cuota ${i + 1}`,
          monto: parseFloat(c.monto),
          moneda: formData.moneda || "COP",
          fecha_vencimiento: c.fecha,
        }));
      if (installments.length > 0) {
        await supabase.from("payment_installments").insert(installments);
      }
    }

    toast.success(
      andSend ? "Contrato creado y enviado" : "Contrato guardado como borrador",
    );
    navigate(`/contracts/${data.id}`);
    setSaving(false);
  };

  const renderField = (variable: TemplateVariable) => {
    const value = formData[variable.key] || "";
    const commonProps = {
      id: variable.key,
      value,
      onChange: (
        e: React.ChangeEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >,
      ) => handleFieldChange(variable.key, e.target.value),
      placeholder: variable.placeholder,
      required: variable.required,
    };

    if (variable.key === "pais") {
      return (
        <Select
          {...commonProps}
          onChange={(e) => {
            handleFieldChange("pais", e.target.value);
            handleFieldChange("departamento", "");
            handleFieldChange("ciudad", "");
          }}
        >
          <option value="">Seleccionar país...</option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      );
    }

    if (variable.key === "departamento") {
      const pais = formData.pais || "";
      if (hasLocationData(pais)) {
        return (
          <Select
            {...commonProps}
            onChange={(e) => {
              handleFieldChange("departamento", e.target.value);
              handleFieldChange("ciudad", "");
            }}
          >
            <option value="">Seleccionar...</option>
            {getDepartments(pais).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        );
      }
      return <Input {...commonProps} type="text" placeholder="Escribir..." />;
    }

    if (variable.key === "ciudad") {
      const pais = formData.pais || "";
      const depto = formData.departamento || "";
      if (hasLocationData(pais) && depto) {
        return (
          <Select {...commonProps}>
            <option value="">Seleccionar...</option>
            {getCities(pais, depto).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="__otra">Otra ciudad...</option>
          </Select>
        );
      }
      return <Input {...commonProps} type="text" placeholder="Escribir..." />;
    }

    switch (variable.type) {
      case "textarea":
        return <Textarea {...commonProps} rows={3} />;
      case "select":
        return (
          <Select {...commonProps}>
            <option value="">Seleccionar...</option>
            {variable.options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </Select>
        );
      default:
        return (
          <Input
            {...commonProps}
            type={
              variable.type === "number"
                ? "number"
                : variable.type === "date"
                  ? "date"
                  : variable.type === "email"
                    ? "email"
                    : "text"
            }
          />
        );
    }
  };

  if (loadingTemplates) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[hsl(var(--primary))]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Nuevo Contrato</h1>
        <p className="text-[hsl(var(--muted-foreground))]">
          Selecciona una plantilla y completa los datos
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          {/* Selector de plantilla */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Plantilla</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select
                onChange={(e) => handleTemplateSelect(e.target.value)}
                value={selectedTemplate?.id || ""}
              >
                <option value="">Seleccionar plantilla...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
              <div className="space-y-1">
                <Label htmlFor="issuer" className="text-xs">
                  Empresa emisora *
                </Label>
                <Select
                  id="issuer"
                  value={issuerId}
                  onChange={(e) => handleIssuerChange(e.target.value)}
                >
                  {ISSUERS.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.label}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  {issuer.empresa} · NIT {issuer.nit}
                </p>
              </div>
              {selectedTemplate &&
                selectedTemplate.variables.some((v) => v.key === "anio") && (
                  <div className="space-y-1">
                    <Label className="text-xs">Año del evento *</Label>
                    <Input
                      value={
                        formData.anio || new Date().getFullYear().toString()
                      }
                      onChange={(e) =>
                        handleFieldChange("anio", e.target.value)
                      }
                    />
                  </div>
                )}
            </CardContent>
          </Card>

          {/* Selector de contacto existente */}
          {selectedTemplate && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contacto</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedContact ? (
                  <div className="flex items-center justify-between p-3 bg-[hsl(var(--secondary))] rounded-lg">
                    <div className="flex items-center gap-2">
                      <UserCheck size={18} className="text-green-600" />
                      <div>
                        <p className="font-medium text-sm">
                          {selectedContact.tipo_persona === "natural"
                            ? selectedContact.nombre_completo
                            : selectedContact.empresa}
                        </p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">
                          {selectedContact.email || ""}{" "}
                          {selectedContact.numero_documento ||
                            selectedContact.id_fiscal ||
                            ""}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={clearContact}>
                      <X size={16} />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Button
                        variant={showContactSearch ? "default" : "outline"}
                        size="sm"
                        onClick={() => setShowContactSearch(!showContactSearch)}
                      >
                        <Search size={14} className="mr-1" /> Buscar existente
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowContactSearch(false)}
                      >
                        <UserPlus size={14} className="mr-1" /> Crear nuevo
                      </Button>
                    </div>

                    {showContactSearch && (
                      <div className="space-y-2">
                        <Input
                          placeholder="Buscar por nombre, empresa, CC, NIT, email..."
                          value={contactSearch}
                          onChange={(e) => setContactSearch(e.target.value)}
                          autoFocus
                        />
                        {searchingContacts && (
                          <p className="text-xs text-[hsl(var(--muted-foreground))]">
                            Buscando...
                          </p>
                        )}
                        {contactResults.length > 0 && (
                          <div className="border rounded-md max-h-48 overflow-auto">
                            {contactResults.map((c) => (
                              <button
                                key={c.id}
                                onClick={() => selectContact(c)}
                                className="w-full text-left p-2 hover:bg-[hsl(var(--secondary))] border-b last:border-0 text-sm"
                              >
                                <span className="font-medium">
                                  {c.tipo_persona === "natural"
                                    ? c.nombre_completo
                                    : c.empresa}
                                </span>
                                <span className="text-[hsl(var(--muted-foreground))] ml-2">
                                  {c.numero_documento || c.id_fiscal || ""} ·{" "}
                                  {c.email || ""} · {c.pais}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                        {contactSearch.length >= 2 &&
                          contactResults.length === 0 &&
                          !searchingContacts && (
                            <p className="text-xs text-[hsl(var(--muted-foreground))]">
                              No se encontró. Llena los datos abajo para crear
                              uno nuevo.
                            </p>
                          )}
                      </div>
                    )}

                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Si el contacto no existe, se creará automáticamente al
                      guardar el contrato.
                    </p>
                  </div>
                )}

                {/* Todos los campos de identidad + contacto (cuando no hay contacto seleccionado) */}
                {!selectedContact && (
                  <>
                    <hr className="my-2" />

                    {/* 1. Tipo de persona */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">
                        Tipo de persona *
                      </Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            formData.tipo_persona === "Persona Natural"
                              ? "default"
                              : "outline"
                          }
                          onClick={() =>
                            handleFieldChange("tipo_persona", "Persona Natural")
                          }
                        >
                          Persona Natural
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            formData.tipo_persona === "Persona Jurídica"
                              ? "default"
                              : "outline"
                          }
                          onClick={() =>
                            handleFieldChange(
                              "tipo_persona",
                              "Persona Jurídica",
                            )
                          }
                        >
                          Persona Jurídica
                        </Button>
                      </div>
                    </div>

                    {/* 2. Identificación según tipo */}
                    {formData.tipo_persona === "Persona Natural" && (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs">Nombre completo *</Label>
                          <Input
                            value={formData.nombre_completo || ""}
                            onChange={(e) =>
                              handleFieldChange(
                                "nombre_completo",
                                e.target.value,
                              )
                            }
                            placeholder="Juan García López"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Tipo documento *</Label>
                            <Select
                              value={formData.tipo_documento || ""}
                              onChange={(e) =>
                                handleFieldChange(
                                  "tipo_documento",
                                  e.target.value,
                                )
                              }
                            >
                              <option value="">Seleccionar...</option>
                              <option value="C.C.">C.C.</option>
                              <option value="C.E.">C.E.</option>
                              <option value="Pasaporte">Pasaporte</option>
                              <option value="DNI">DNI</option>
                              <option value="Tax ID">Tax ID</option>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">
                              Número documento *
                            </Label>
                            <Input
                              value={formData.numero_documento || ""}
                              onChange={(e) =>
                                handleFieldChange(
                                  "numero_documento",
                                  e.target.value,
                                )
                              }
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {formData.tipo_persona === "Persona Jurídica" && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Razón social *</Label>
                            <Input
                              value={formData.empresa || ""}
                              onChange={(e) =>
                                handleFieldChange("empresa", e.target.value)
                              }
                              placeholder="Empresa S.A.S."
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">NIT / Tax ID *</Label>
                            <Input
                              value={formData.id_fiscal || ""}
                              onChange={(e) =>
                                handleFieldChange("id_fiscal", e.target.value)
                              }
                              placeholder="900.123.456-7"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">
                            Sigla{" "}
                            <span className="text-[hsl(var(--muted-foreground))]">
                              (opcional)
                            </span>
                          </Label>
                          <Input
                            value={formData.sigla || ""}
                            onChange={(e) =>
                              handleFieldChange("sigla", e.target.value)
                            }
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">
                              Representante legal *
                            </Label>
                            <Input
                              value={formData.representante_legal || ""}
                              onChange={(e) =>
                                handleFieldChange(
                                  "representante_legal",
                                  e.target.value,
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">
                              Documento representante *
                            </Label>
                            <Input
                              value={
                                formData.numero_documento_representante || ""
                              }
                              onChange={(e) =>
                                handleFieldChange(
                                  "numero_documento_representante",
                                  e.target.value,
                                )
                              }
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {/* 2.5 Tipo de patrocinio (solo para template de patrocinio) */}
                    {formData.tipo_persona &&
                      selectedTemplate?.variables.some(
                        (v) => v.key === "tipo_patrocinio",
                      ) && (
                        <div className="space-y-1">
                          <Label className="text-xs">
                            Tipo de patrocinio *
                          </Label>
                          <Select
                            value={formData.tipo_patrocinio || ""}
                            onChange={(e) =>
                              handleFieldChange(
                                "tipo_patrocinio",
                                e.target.value,
                              )
                            }
                          >
                            <option value="">Seleccionar...</option>
                            <option value="Patrocinio Black">
                              Patrocinio Black
                            </option>
                            <option value="Patrocinio Diamante">
                              Patrocinio Diamante
                            </option>
                            <option value="Patrocinio Platino">
                              Patrocinio Platino
                            </option>
                            <option value="Patrocinio Oro">
                              Patrocinio Oro
                            </option>
                            <option value="Patrocinio Plata">
                              Patrocinio Plata
                            </option>
                            <option value="Patrocinio Bronce">
                              Patrocinio Bronce
                            </option>
                            <option value="Patrocinio Académico">
                              Patrocinio Académico
                            </option>
                          </Select>
                        </div>
                      )}

                    {/* 3. Datos de contacto (solo después de seleccionar tipo persona) */}
                    {formData.tipo_persona && (
                      <>
                        <hr className="my-1" />
                        <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                          Datos de contacto
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Email *</Label>
                            <Input
                              type="email"
                              value={
                                formData.email ||
                                formData.email_contratista ||
                                ""
                              }
                              onChange={(e) => {
                                handleFieldChange("email", e.target.value);
                                handleFieldChange(
                                  "email_contratista",
                                  e.target.value,
                                );
                              }}
                              placeholder="correo@empresa.com"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Celular *</Label>
                            <Input
                              value={formData.celular || ""}
                              onChange={(e) =>
                                handleFieldChange("celular", e.target.value)
                              }
                              placeholder="+57 300 0000000"
                            />
                          </div>
                        </div>

                        {/* 4. Ubicación: País → Departamento → Ciudad → Dirección */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">País *</Label>
                            <Select
                              value={formData.pais || ""}
                              onChange={(e) => {
                                handleFieldChange("pais", e.target.value);
                                handleFieldChange("departamento", "");
                                handleFieldChange("ciudad", "");
                              }}
                            >
                              <option value="">Seleccionar...</option>
                              {COUNTRIES.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Departamento *</Label>
                            {hasLocationData(formData.pais || "") ? (
                              <Select
                                value={formData.departamento || ""}
                                onChange={(e) => {
                                  handleFieldChange(
                                    "departamento",
                                    e.target.value,
                                  );
                                  handleFieldChange("ciudad", "");
                                }}
                              >
                                <option value="">Seleccionar...</option>
                                {getDepartments(formData.pais).map((d) => (
                                  <option key={d} value={d}>
                                    {d}
                                  </option>
                                ))}
                              </Select>
                            ) : (
                              <Input
                                value={formData.departamento || ""}
                                onChange={(e) =>
                                  handleFieldChange(
                                    "departamento",
                                    e.target.value,
                                  )
                                }
                                placeholder="Escribir..."
                              />
                            )}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Ciudad *</Label>
                            {hasLocationData(formData.pais || "") &&
                            formData.departamento ? (
                              <Select
                                value={formData.ciudad || ""}
                                onChange={(e) =>
                                  handleFieldChange("ciudad", e.target.value)
                                }
                              >
                                <option value="">Seleccionar...</option>
                                {getCities(
                                  formData.pais,
                                  formData.departamento,
                                ).map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                                <option value="__otra">Otra...</option>
                              </Select>
                            ) : (
                              <Input
                                value={formData.ciudad || ""}
                                onChange={(e) =>
                                  handleFieldChange("ciudad", e.target.value)
                                }
                                placeholder="Escribir..."
                              />
                            )}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Dirección *</Label>
                          <Input
                            value={formData.direccion || ""}
                            onChange={(e) =>
                              handleFieldChange("direccion", e.target.value)
                            }
                            placeholder="Calle 10 # 20-30"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">
                              Teléfono fijo{" "}
                              <span className="text-[hsl(var(--muted-foreground))]">
                                (opcional)
                              </span>
                            </Label>
                            <Input
                              value={formData.telefono || ""}
                              onChange={(e) =>
                                handleFieldChange("telefono", e.target.value)
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">
                              Web / Redes{" "}
                              <span className="text-[hsl(var(--muted-foreground))]">
                                (opcional)
                              </span>
                            </Label>
                            <Input
                              value={formData.web_redes || ""}
                              onChange={(e) =>
                                handleFieldChange("web_redes", e.target.value)
                              }
                            />
                          </div>
                        </div>

                        {/* 5. Persona encargada (solo si la plantilla la usa) */}
                        {usesEncargada && (
                          <>
                            <hr className="my-1" />
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                                Persona encargada (contacto directo)
                              </p>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const nombre =
                                    formData.tipo_persona === "Persona Jurídica"
                                      ? formData.representante_legal
                                      : formData.nombre_completo;
                                  if (nombre)
                                    handleFieldChange(
                                      "persona_encargada",
                                      nombre,
                                    );
                                  if (formData.email)
                                    handleFieldChange(
                                      "email_encargada",
                                      formData.email,
                                    );
                                  if (formData.celular)
                                    handleFieldChange(
                                      "celular_encargada",
                                      formData.celular,
                                    );
                                }}
                              >
                                Misma persona del contrato
                              </Button>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs">Nombre</Label>
                                <Input
                                  value={formData.persona_encargada || ""}
                                  onChange={(e) =>
                                    handleFieldChange(
                                      "persona_encargada",
                                      e.target.value,
                                    )
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Email</Label>
                                <Input
                                  type="email"
                                  value={formData.email_encargada || ""}
                                  onChange={(e) =>
                                    handleFieldChange(
                                      "email_encargada",
                                      e.target.value,
                                    )
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Celular</Label>
                                <Input
                                  value={formData.celular_encargada || ""}
                                  onChange={(e) =>
                                    handleFieldChange(
                                      "celular_encargada",
                                      e.target.value,
                                    )
                                  }
                                />
                              </div>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </>
                )}

                {/* Resumen firmante */}
                {signerName && (
                  <div className="mt-2 p-2 bg-[hsl(var(--secondary))] rounded text-xs text-[hsl(var(--muted-foreground))]">
                    Firmante:{" "}
                    <strong className="text-[hsl(var(--foreground))]">
                      {signerName}
                    </strong>
                    {signerCompany ? ` · ${signerCompany}` : ""}
                    {signerEmail ? ` · ${signerEmail}` : ""}
                    <br />
                    Emite:{" "}
                    <strong className="text-[hsl(var(--foreground))]">
                      {issuer.empresa}
                    </strong>{" "}
                    · NIT {issuer.nit}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Tipo de Stand (solo para templates de stand) */}
          {selectedTemplate &&
            selectedTemplate.variables.some(
              (v) => v.key === "tamano_stand",
            ) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Tipo de Stand</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: "2×2", medidas: "2x2", m2: 4, tipo: "Estándar" },
                      { label: "2×3", medidas: "2x3", m2: 6, tipo: "Estándar" },
                      { label: "4×2", medidas: "4x2", m2: 8, tipo: "Estándar" },
                      {
                        label: "4×3",
                        medidas: "4x3",
                        m2: 12,
                        tipo: "Estándar",
                      },
                      {
                        label: "5×3",
                        medidas: "5x3",
                        m2: 15,
                        tipo: "Estándar",
                      },
                      {
                        label: "6×3",
                        medidas: "6x3",
                        m2: 18,
                        tipo: "Estándar",
                      },
                      {
                        label: "5×3 Isla",
                        medidas: "5x3",
                        m2: 15,
                        tipo: "Tipo Isla",
                      },
                      {
                        label: "6×3 Isla",
                        medidas: "6x3",
                        m2: 18,
                        tipo: "Tipo Isla",
                      },
                      {
                        label: "6×4",
                        medidas: "6x4",
                        m2: 24,
                        tipo: "Estándar",
                      },
                    ].map((stand) => {
                      const isSelected =
                        formData.tamano_stand ===
                        `${stand.m2} m² (${stand.medidas} - ${stand.tipo})`;
                      return (
                        <button
                          key={stand.label}
                          type="button"
                          onClick={() => {
                            handleFieldChange(
                              "tamano_stand",
                              `${stand.m2} m² (${stand.medidas} - ${stand.tipo})`,
                            );
                          }}
                          className={`p-3 border rounded-lg text-center transition-colors ${
                            isSelected
                              ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"
                              : "hover:bg-[hsl(var(--secondary))]"
                          }`}
                        >
                          <p className="font-bold text-lg">{stand.label}</p>
                          <p className="text-xs text-[hsl(var(--muted-foreground))]">
                            {stand.m2} m²
                          </p>
                          {stand.tipo !== "Estándar" && (
                            <p className="text-xs font-medium mt-1">
                              {stand.tipo}
                            </p>
                          )}
                        </button>
                      );
                    })}
                    {/* Botón Otro / Especial */}
                    <button
                      type="button"
                      onClick={() =>
                        handleFieldChange("tamano_stand", "__custom")
                      }
                      className={`p-3 border rounded-lg text-center transition-colors ${
                        formData.tamano_stand === "__custom"
                          ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"
                          : "hover:bg-[hsl(var(--secondary))] border-dashed"
                      }`}
                    >
                      <p className="font-bold text-lg">Otro</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        Medida especial
                      </p>
                    </button>
                  </div>

                  {/* Campos manuales para medida especial */}
                  {formData.tamano_stand === "__custom" && (
                    <div className="p-3 border rounded-lg bg-[hsl(var(--secondary))] space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Ancho (metros)</Label>
                          <Input
                            type="number"
                            value={formData._stand_ancho || ""}
                            onChange={(e) => {
                              handleFieldChange("_stand_ancho", e.target.value);
                              const largo = Number(formData._stand_largo || 0);
                              const ancho = Number(e.target.value || 0);
                              if (ancho > 0 && largo > 0) {
                                handleFieldChange(
                                  "_stand_m2",
                                  String(ancho * largo),
                                );
                                handleFieldChange(
                                  "_stand_medidas",
                                  `${ancho}x${largo}`,
                                );
                              }
                            }}
                            placeholder="8"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Largo (metros)</Label>
                          <Input
                            type="number"
                            value={formData._stand_largo || ""}
                            onChange={(e) => {
                              handleFieldChange("_stand_largo", e.target.value);
                              const ancho = Number(formData._stand_ancho || 0);
                              const largo = Number(e.target.value || 0);
                              if (ancho > 0 && largo > 0) {
                                handleFieldChange(
                                  "_stand_m2",
                                  String(ancho * largo),
                                );
                                handleFieldChange(
                                  "_stand_medidas",
                                  `${ancho}x${largo}`,
                                );
                              }
                            }}
                            placeholder="5"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Metros cuadrados</Label>
                          <Input
                            type="text"
                            value={
                              formData._stand_m2
                                ? `${formData._stand_m2} m²`
                                : ""
                            }
                            readOnly
                            className="bg-white font-medium"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Tipo de stand</Label>
                          <Input
                            value={formData._stand_tipo || ""}
                            onChange={(e) =>
                              handleFieldChange("_stand_tipo", e.target.value)
                            }
                            placeholder="Isla, Esquinero, etc."
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {formData.tamano_stand &&
                    formData.tamano_stand !== "__custom" && (
                      <p className="text-sm bg-[hsl(var(--secondary))] p-2 rounded">
                        Seleccionado: <strong>{formData.tamano_stand}</strong>
                      </p>
                    )}
                  {formData.tamano_stand === "__custom" &&
                    formData._stand_m2 && (
                      <p className="text-sm bg-[hsl(var(--secondary))] p-2 rounded">
                        Seleccionado:{" "}
                        <strong>
                          {formData._stand_m2} m² ({formData._stand_medidas}
                          {formData._stand_tipo
                            ? ` - ${formData._stand_tipo}`
                            : ""}
                          )
                        </strong>
                      </p>
                    )}

                  {/* Ubicación del stand */}
                  <hr />
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>Pabellón</Label>
                      <Input
                        value={formData.pabellon || ""}
                        onChange={(e) =>
                          handleFieldChange("pabellon", e.target.value)
                        }
                        placeholder="A"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>N.º Stand</Label>
                      <Input
                        value={formData.numero_stand || ""}
                        onChange={(e) =>
                          handleFieldChange("numero_stand", e.target.value)
                        }
                        placeholder="A-15"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Ubicación</Label>
                      <Input
                        value={formData.ubicacion || ""}
                        onChange={(e) =>
                          handleFieldChange("ubicacion", e.target.value)
                        }
                        placeholder="Pasillo 3, esquina norte"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

          {/* Datos del contrato (solo si quedan variables no gestionadas en otras secciones) */}
          {selectedTemplate && visibleVariables.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Datos del Contrato</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {visibleVariables.map((variable) => (
                  <div key={variable.key} className="space-y-2">
                    <Label htmlFor={variable.key}>
                      {variable.label}{" "}
                      {variable.required && (
                        <span className="text-[hsl(var(--destructive))]">
                          *
                        </span>
                      )}
                    </Label>
                    {renderField(variable)}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Valor y Cronograma de pagos */}
          {selectedTemplate && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Valor y Forma de Pago
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Valor total y moneda */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2 col-span-2">
                    <Label>Valor total (IVA incluido) *</Label>
                    <Input
                      type="text"
                      value={formData.valor_total || formData.honorarios || ""}
                      onChange={(e) => {
                        // Actualizar todos los posibles keys de valor según template
                        handleFieldChange("valor_total", e.target.value);
                        handleFieldChange("honorarios", e.target.value);
                      }}
                      placeholder="10.000.000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Moneda</Label>
                    <Select
                      value={formData.moneda || "COP"}
                      onChange={(e) =>
                        handleFieldChange("moneda", e.target.value)
                      }
                    >
                      <option value="COP">COP</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </Select>
                  </div>
                </div>

                {(formData.valor_total || formData.honorarios) && (
                  <div className="text-sm bg-[hsl(var(--secondary))] p-3 rounded">
                    <span className="text-[hsl(var(--muted-foreground))]">
                      En letras:{" "}
                    </span>
                    <span className="font-medium">
                      {moneyToWords(
                        formData.valor_total || formData.honorarios || "0",
                        formData.moneda || "COP",
                      )}
                    </span>
                  </div>
                )}

                {/* Modalidad de pago */}
                <div className="space-y-2">
                  <Label>Modalidad de pago</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={numCuotas === 1 ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        handleNumCuotasChange(1);
                        setCuotas([
                          {
                            descripcion: "Pago único de contado",
                            monto:
                              formData.valor_total || formData.honorarios || "",
                            fecha: "",
                          },
                        ]);
                      }}
                    >
                      Pago de contado
                    </Button>
                    <Button
                      type="button"
                      variant={numCuotas > 1 ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        if (numCuotas <= 1) handleNumCuotasChange(2);
                      }}
                    >
                      Pago por cuotas
                    </Button>
                    <Button
                      type="button"
                      variant={numCuotas === 0 ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleNumCuotasChange(0)}
                    >
                      Sin definir aún
                    </Button>
                  </div>
                </div>

                {/* Número de cuotas (solo si es por cuotas) */}
                {numCuotas > 1 && (
                  <div className="flex items-center gap-3">
                    <Label>Número de cuotas</Label>
                    <Select
                      value={String(numCuotas)}
                      onChange={(e) =>
                        handleNumCuotasChange(Number(e.target.value))
                      }
                      className="w-24"
                    >
                      {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}

                {/* Detalle de cuotas */}
                {cuotas.map((cuota, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-3 gap-3 p-3 border rounded-lg bg-[hsl(var(--secondary))]"
                  >
                    <div className="space-y-1">
                      <Label className="text-xs">Descripción</Label>
                      <Input
                        value={cuota.descripcion}
                        onChange={(e) =>
                          updateCuota(i, "descripcion", e.target.value)
                        }
                        placeholder={`Cuota ${i + 1}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">
                        Monto ({formData.moneda || "COP"}) *
                      </Label>
                      <Input
                        type="number"
                        value={cuota.monto}
                        onChange={(e) =>
                          updateCuota(i, "monto", e.target.value)
                        }
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Fecha límite *</Label>
                      <Input
                        type="date"
                        value={cuota.fecha}
                        onChange={(e) =>
                          updateCuota(i, "fecha", e.target.value)
                        }
                      />
                    </div>
                  </div>
                ))}

                {/* Resumen de pagos */}
                {cuotas.length > 0 && cuotas.some((c) => c.monto) && (
                  <div className="text-sm bg-[hsl(var(--secondary))] p-3 rounded space-y-1">
                    <div className="flex justify-between">
                      <span className="text-[hsl(var(--muted-foreground))]">
                        Total cuotas:
                      </span>
                      <span className="font-medium">
                        {formData.moneda || "COP"} $
                        {new Intl.NumberFormat("es-CO").format(
                          cuotas.reduce(
                            (s, c) => s + (Number(c.monto) || 0),
                            0,
                          ),
                        )}
                      </span>
                    </div>
                    {formData.valor_total && (
                      <div className="flex justify-between">
                        <span className="text-[hsl(var(--muted-foreground))]">
                          Diferencia con valor total:
                        </span>
                        <span
                          className={`font-medium ${Math.abs(Number(formData.valor_total) - cuotas.reduce((s, c) => s + (Number(c.monto) || 0), 0)) > 0 ? "text-orange-600" : "text-green-600"}`}
                        >
                          {formData.moneda || "COP"} $
                          {new Intl.NumberFormat("es-CO").format(
                            Number(formData.valor_total) -
                              cuotas.reduce(
                                (s, c) => s + (Number(c.monto) || 0),
                                0,
                              ),
                          )}
                        </span>
                      </div>
                    )}
                    <p className="text-xs text-[hsl(var(--muted-foreground))] pt-2 border-t mt-2">
                      <strong>Forma de pago en contrato:</strong>{" "}
                      {formaPagoFromCuotas}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Acciones */}
          {selectedTemplate && (
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => handleSave(false)}
                disabled={saving}
              >
                Guardar Borrador
              </Button>
              <Button onClick={() => handleSave(true)} disabled={saving}>
                {saving ? "Guardando..." : "Crear y Enviar"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowPreview(!showPreview)}
                className="lg:hidden"
              >
                {showPreview ? "Ocultar" : "Ver"} Preview
              </Button>
            </div>
          )}
        </div>

        {/* Preview */}
        {selectedTemplate && (
          <div className={`${showPreview ? "block" : "hidden"} lg:block`}>
            <Card className="sticky top-6">
              <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base">
                    {editMode ? "Editar Contrato" : "Vista Previa"}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {editedHtml !== null && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditedHtml(null);
                          setEditMode(false);
                        }}
                        title="Descartar la edición y volver al texto de la plantilla"
                      >
                        <RotateCcw size={14} className="mr-1" /> Revertir
                      </Button>
                    )}
                    {editMode ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditMode(false)}
                      >
                        <Eye size={14} className="mr-1" /> Vista previa
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditedHtml(finalHtml);
                          setEditMode(true);
                        }}
                      >
                        <Pencil size={14} className="mr-1" /> Editar
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {editMode ? (
                  <div className="space-y-2">
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Editas solo este contrato; la plantilla no se modifica. Si
                      cambias un campo del formulario después de editar, usa
                      "Revertir" para regenerar el texto.
                    </p>
                    <RichTextEditor
                      value={editedHtml ?? ""}
                      onChange={setEditedHtml}
                    />
                  </div>
                ) : (
                  <div
                    className="prose prose-sm max-w-none border rounded-md p-4 bg-white text-black overflow-auto max-h-[70vh]"
                    dangerouslySetInnerHTML={{ __html: finalHtml }}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
