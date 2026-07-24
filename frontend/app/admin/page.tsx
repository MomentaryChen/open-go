import { redirect } from 'next/navigation'

export default function AdminHomePage() {
  // Job monitoring is the first thing an operator needs on opening the console.
  redirect('/admin/jobs')
}
