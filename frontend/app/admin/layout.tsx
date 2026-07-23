import type { Metadata } from 'next'
import { Toaster } from '@/components/ui/sonner'
import { AdminNav } from '@/components/admin/admin-nav'

export const metadata: Metadata = {
  title: '管理後台 | Travel Discovery',
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
