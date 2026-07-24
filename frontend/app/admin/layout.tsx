import type { Metadata } from 'next'
import { Toaster } from '@/components/ui/sonner'
import { AdminNav } from '@/components/admin/admin-nav'
import { getServerDictionary } from '@/lib/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerDictionary()
  return { title: t.admin.metaTitle }
}

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen bg-muted/30">
      <AdminNav />
      <main className="flex-1 p-6 md:p-8">{children}</main>
      <Toaster />
    </div>
  )
}
