import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { toast } from 'sonner'

const MIN_LENGTH = 8

export function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  // 'verificando' mientras Supabase procesa el enlace del correo; 'listo' cuando
  // hay sesion de recuperacion; 'invalido' si el enlace vencio o ya se uso.
  const [estado, setEstado] = useState<'verificando' | 'listo' | 'invalido'>('verificando')
  const navigate = useNavigate()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) setEstado('listo')
    })

    // El evento puede haberse disparado antes de montar: se revisa la sesion y,
    // si no aparece, se da un margen corto antes de declarar el enlace invalido.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setEstado('listo')
    })
    const timer = setTimeout(() => setEstado((e) => (e === 'verificando' ? 'invalido' : e)), 4000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password.length < MIN_LENGTH) {
      toast.error(`La contraseña debe tener al menos ${MIN_LENGTH} caracteres`)
      return
    }
    if (password !== confirm) {
      toast.error('Las contraseñas no coinciden')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      toast.error('No pudimos cambiar la contraseña', { description: error.message })
      return
    }

    toast.success('Contraseña actualizada')
    // Se cierra la sesion de recuperacion para entrar con la contraseña nueva.
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--secondary))] px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Nueva contraseña</CardTitle>
          <CardDescription>
            {estado === 'invalido' ? 'El enlace no es válido' : 'Elige una contraseña nueva para tu cuenta'}
          </CardDescription>
        </CardHeader>

        {estado === 'verificando' && (
          <CardContent className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[hsl(var(--primary))]" />
          </CardContent>
        )}

        {estado === 'invalido' && (
          <>
            <CardContent>
              <p className="text-sm text-[hsl(var(--muted-foreground))] text-center">
                El enlace venció o ya se usó. Pide uno nuevo para restablecer tu contraseña.
              </p>
            </CardContent>
            <CardFooter className="flex-col gap-2">
              <Button className="w-full" onClick={() => navigate('/forgot-password')}>
                Pedir un enlace nuevo
              </Button>
              <Link to="/login" className="text-sm text-[hsl(var(--muted-foreground))] hover:underline">
                Volver a iniciar sesión
              </Link>
            </CardFooter>
          </>
        )}

        {estado === 'listo' && (
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña nueva</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={MIN_LENGTH}
                  autoComplete="new-password"
                />
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Mínimo {MIN_LENGTH} caracteres.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirmar contraseña</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={MIN_LENGTH}
                  autoComplete="new-password"
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Guardando...' : 'Cambiar contraseña'}
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  )
}
