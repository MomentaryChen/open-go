import { redirect } from 'next/navigation'

// The trip planner is the home page now; keep old /trip links working.
export default function TripPage() {
  redirect('/')
}
