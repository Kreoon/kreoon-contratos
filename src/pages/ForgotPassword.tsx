import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { toast } from 'sonner'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    // No revelamos si el correo existe: ante cualquier error que no sea de
    // red o de limite de envios, mostramos el mismo mensaje de exito.
    if (error && (error.status === 429 || error.status === 0 || error.name === 'AuthRetryableFetchError')) {
      toast.error('No pudimos enviar el correo', {
        description: error.status === 429 ? 'Espera un momento antes de volver a intentarlo.' : error.message,
      })
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--secondary))] px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Recuperar contraseña</CardTitle>
          <CardDescription>
            {sent
              ? 'Revisa tu correo'
              : 'Escribe tu email y te enviaremos un enlace para crear una nueva contraseña'}
          </CardDescription>
        </CardHeader>
        {sent ? (
          <>
            <CardContent>
              <p className="text-sm text-[hsl(var(--muted-foreground))] text-center">
                Si <strong>{email}</strong> tiene una cuenta, te llegará un enlace para restablecer la
                contraseña. Revisa también la carpeta de spam.
              </p>
            </CardContent>
            <CardFooter className="flex-col gap-2">
              <Button variant="outline" className="w-full" onClick={() => setSent(false)}>
                Usar otro email
              </Button>
              <Link to="/login" className="text-sm text-[hsl(var(--muted-foreground))] hover:underline">
                Volver a iniciar sesión
              </Link>
            </CardFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  autoComplete="email"
                />
              </div>
            </CardContent>
            <CardFooter className="flex-col gap-2">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Enviando...' : 'Enviar enlace'}
              </Button>
              <Link to="/login" className="text-sm text-[hsl(var(--muted-foreground))] hover:underline">
                Volver a iniciar sesión
              </Link>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  )
}
