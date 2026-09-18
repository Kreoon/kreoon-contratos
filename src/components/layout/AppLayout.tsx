import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, FileText, ScrollText, Users, LogOut, Menu, X } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/templates', label: 'Plantillas', icon: FileText },
  { path: '/contracts', label: 'Contratos', icon: ScrollText },
  { path: '/contacts', label: 'Contactos', icon: Users },
]

export function AppLayout() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  // Este sistema comparte usuarios con el panel interno de Feria Effix: con
  // sesion iniciada no alcanza, hay que operar contratos (ver la migracion
  // 013). Las reglas de la base ya lo impiden, pero sin este chequeo quien no
  // tiene acceso veria pantallas vacias o errores sin entender por que.
  const [acceso, setAcceso] = useState<'verificando' | 'si' | 'no' | 'error'>('verificando')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // Demo mode: skip auth
      setLoading(false)
      return
    }

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        navigate('/login')
      } else {
        setUser(user)
        // Falla cerrada: si no se puede verificar, no se asume acceso.
        const { data, error } = await supabase.rpc('puede_operar_contratos')
        setAcceso(error ? 'error' : data === true ? 'si' : 'no')
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) navigate('/login')
      else setUser(session.user)
    })

    return () => subscription.unsubscribe()
  }, [navigate])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  if (!loading && isSupabaseConfigured && user && acceso !== 'si') {
    return (
      <div className="flex h-screen items-center justify-center bg-[hsl(var(--background))] p-6">
        <div className="max-w-md space-y-4 rounded-lg border bg-[hsl(var(--card))] p-6 text-center">
          <h1 className="text-lg font-bold text-[hsl(var(--foreground))]">
            {acceso === 'error' ? 'No pudimos verificar tu acceso' : 'No tienes acceso al sistema de contratos'}
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {acceso === 'error'
              ? 'Intenta de nuevo en unos segundos. Si sigue pasando, avisa a la gerencia.'
              : `La cuenta ${user.email} no está habilitada para operar contratos. Si necesitas acceso, pídelo a la gerencia.`}
          </p>
          <div className="flex justify-center gap-3">
            {acceso === 'error' && (
              <button
                onClick={() => window.location.reload()}
                className="rounded-md border px-4 py-2 text-sm"
              >
                Reintentar
              </button>
            )}
            <button
              onClick={handleLogout}
              className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm text-[hsl(var(--primary-foreground))]"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[hsl(var(--primary))]" />
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-[hsl(var(--background))]">
      {/* Mobile menu button */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-md bg-[hsl(var(--background))] border"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={sidebarOpen ? 'Cerrar menu' : 'Abrir menu'}
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-40 w-64 bg-[hsl(var(--card))] border-r transform transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex flex-col h-full">
          <div className="p-6 border-b">
            <h1 className="text-lg font-bold text-[hsl(var(--foreground))]">Contratos Effix</h1>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">Sistema de Gestion</p>
          </div>

          <nav className="flex-1 p-4 space-y-1" aria-label="Navegacion principal">
            {navItems.map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                end={path === '/'}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                      : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]'
                  }`
                }
              >
                <Icon size={18} aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="p-4 border-t">
            <div className="text-xs text-[hsl(var(--muted-foreground))] mb-2 truncate">
              {user?.email}
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))] transition-colors"
              aria-label="Cerrar sesion"
            >
              <LogOut size={16} aria-hidden="true" />
              Cerrar sesion
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 lg:p-8 max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
