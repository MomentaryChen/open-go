import { redirect } from 'next/navigation'

export default function AdminHomePage() {
  // System health is the first place to look when jobs fail at scale.
  redirect('/admin/health')
}
