'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Activity,
  Home,
  ListChecks,
  LogOut,
  MessageSquareText,
  Settings,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LanguageToggle } from '@/components/language-toggle'
import { useLanguage } from '@/lib/i18n/context'
import { adminLogout } from '@/lib/admin'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/admin/health', key: 'health', icon: Activity },
  { href: '/admin/jobs', key: 'jobs', icon: ListChecks },
  { href: '/admin/keywords', key: 'keywords', icon: TrendingUp },
  { href: '/admin/affiliate', key: 'affiliate', icon: ShoppingBag },
  { href: '/admin/prompts', key: 'prompts', icon: MessageSquareText },
  { href: '/admin/settings', key: 'settings', icon: Settings },
] as const

export function AdminNav() {
  const { t } = useLanguage()
  const pathname = usePathname()
  const router = useRouter()

  // The admin layout also wraps the login page, where a sidebar makes no sense.
  if (pathname === '/admin/login') return null

  const handleLogout = async () => {
    await adminLogout()
    router.push('/admin/login')
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r bg-background">
      <div className="border-b p-4">
        <p className="text-lg font-semibold">{t.admin.sidebarTitle}</p>
        <p className="text-xs text-muted-foreground">{t.admin.brand}</p>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
              pathname.startsWith(item.href)
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <item.icon className="h-4 w-4" />
            {t.admin.nav[item.key]}
          </Link>
        ))}
      </nav>
      <div className="space-y-1 border-t p-2">
        <div className="px-1 pb-1">
          <LanguageToggle className="w-full justify-start" />
        </div>
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Home className="h-4 w-4" />
          {t.admin.backToSite}
        </Link>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 px-3 text-sm text-muted-foreground"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          {t.admin.logout}
        </Button>
      </div>
    </aside>
  )
}
