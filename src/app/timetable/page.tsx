import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession, SESSION_COOKIE } from '@/lib/auth/session';

export default async function TimetableRedirectPage() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    const user = await verifySession(token);

    if (user?.role === 'faculty' && user?.faculty_id) {
      redirect(`/timetable/faculty/${user.faculty_id}`);
    }
  } catch {
    // Fall back to default group timetable
  }

  redirect('/timetable/group/Y1-A');
}
