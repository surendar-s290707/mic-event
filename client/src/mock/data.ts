/**
 * ===========================================================================
 * CURRENT MOCK FUNCTIONALITY — development data only.
 * ===========================================================================
 * Every piece of fake data in the app lives in this one file. When the
 * PostgreSQL + Prisma backend lands, this file is deleted and the store is
 * pointed at the API; no component imports it directly.
 *
 * Dates are generated relative to "now" so the demo always looks current.
 */

import type { CheckIn, EventItem, Registration, User } from '../lib/types';

// --- helpers ---------------------------------------------------------------

function at(dayOffset: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function iso(dayOffset: number, hour: number, minute = 0): string {
  return at(dayOffset, hour, minute).toISOString();
}

/** Deterministic code so the same registration always shows the same ticket. */
function ticketCode(eventPrefix: string, index: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let n = (index + 7) * 2654435761;
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[Math.abs(n) % alphabet.length];
    n = Math.floor(n / alphabet.length) + index * 31 + i;
  }
  return `MIC-${eventPrefix}-${out}`;
}

// --- users -----------------------------------------------------------------

export const organizers: User[] = [
  { id: 'org_1', name: 'Aditi Rao', email: 'aditi@mic.dev', role: 'ORGANIZER' },
  { id: 'org_2', name: 'Rahul Menon', email: 'rahul@mic.dev', role: 'ORGANIZER' },
];

export const attendees: User[] = [
  { id: 'att_1', name: 'Sneha Iyer', email: 'sneha@student.mic.dev', role: 'ATTENDEE' },
  { id: 'att_2', name: 'Karthik Nair', email: 'karthik@student.mic.dev', role: 'ATTENDEE' },
  { id: 'att_3', name: 'Meera Joseph', email: 'meera@student.mic.dev', role: 'ATTENDEE' },
  { id: 'att_4', name: 'Arjun Das', email: 'arjun@student.mic.dev', role: 'ATTENDEE' },
  { id: 'att_5', name: 'Fatima Sheikh', email: 'fatima@student.mic.dev', role: 'ATTENDEE' },
];

export const users: User[] = [...organizers, ...attendees];

/** Signed-in-by-default demo accounts shown on the login screen. */
export const demoCredentials = {
  ORGANIZER: { email: 'aditi@mic.dev', password: 'mic1234' },
  ATTENDEE: { email: 'sneha@student.mic.dev', password: 'mic1234' },
} as const;

// --- events ----------------------------------------------------------------

export const events: EventItem[] = [
  {
    id: 'ev_1',
    name: 'VITSION Screening Night',
    description:
      'Short films made by students this semester, on the big screen. Doors open 30 minutes early — snacks on us until they run out.',
    venue: 'Anna Auditorium',
    startsAt: iso(0, 18, 30),
    endsAt: iso(0, 21, 0),
    capacity: 100,
    organizerId: 'org_1',
  },
  {
    id: 'ev_2',
    name: 'Hack the Campus — Kickoff',
    description:
      'Team forming, problem statements and the rules for the 24-hour build. Bring a laptop and one idea you actually care about.',
    venue: 'Tech Park Seminar Hall',
    startsAt: iso(3, 10, 0),
    endsAt: iso(3, 13, 0),
    capacity: 60,
    organizerId: 'org_1',
  },
  {
    id: 'ev_3',
    name: 'Design Jam: Figma Basics',
    description:
      'A hands-on session for anyone who has never opened Figma. We build one screen together, start to finish.',
    venue: 'Innovation Lab 2',
    startsAt: iso(8, 16, 0),
    endsAt: iso(8, 18, 0),
    capacity: 40,
    organizerId: 'org_2',
  },
];

// --- registrations ---------------------------------------------------------

/** Filler names so counts look real without listing 60 objects by hand. */
const fillerNames = [
  'Ananya Pillai', 'Vikram Shetty', 'Nikhil Raj', 'Divya Menon', 'Rohan Gupta',
  'Priya Balan', 'Ishaan Verma', 'Tanvi Deshpande', 'Aravind Kumar', 'Zoya Khan',
  'Harsha Reddy', 'Neha Sundaram', 'Gokul Prasad', 'Riya Chandran', 'Aditya Bose',
  'Lakshmi Narayan', 'Sameer Ali', 'Pooja Hegde', 'Manish Thomas', 'Kavya Suresh',
  'Dhruv Kapoor', 'Anjali Varma', 'Yusuf Rahman', 'Swathi Mohan', 'Nandini Rao',
  'Praveen Kumar', 'Ritika Jain', 'Farhan Sheikh', 'Deepak Krishnan', 'Aisha Begum',
  'Varun Pillai', 'Shreya Ghosh', 'Kabir Singh', 'Trisha Nair', 'Vishal Menon',
  'Ayesha Fernandes', 'Naveen Chandra', 'Bhavya Reddy', 'Imran Qureshi', 'Sanjana Roy',
  'Akash Dubey', 'Nithya Raman', 'Joel Mathew', 'Sara Thomas', 'Rakesh Yadav',
  'Charan Teja', 'Megha Kulkarni', 'Siddharth Iyer', 'Leela Krishnan', 'Tarun Bhatia',
  'Aparna Nambiar', 'Hemant Joshi', 'Nisha Pandey', 'Vivek Anand', 'Reshma Pillai',
  'Gaurav Sinha',
];

/**
 * Builds `count` registrations for an event. The five named demo attendees are
 * always first so the attendee dashboard has real tickets to open.
 */
function buildRegistrations(
  eventId: string,
  prefix: string,
  count: number,
  namedAttendees: User[],
  minutesBefore: number,
): Registration[] {
  const list: Registration[] = [];
  for (let i = 0; i < count; i += 1) {
    const named = namedAttendees[i];
    const name = named ? named.name : fillerNames[(i - namedAttendees.length) % fillerNames.length];
    const id = named ? named.id : `${prefix.toLowerCase()}_guest_${i}`;
    list.push({
      id: `reg_${eventId}_${i}`,
      eventId,
      attendeeId: id,
      attendeeName: name,
      // Spread sign-ups over the days before the event.
      createdAt: new Date(Date.now() - (minutesBefore + i * 37) * 60_000).toISOString(),
      ticketCode: ticketCode(prefix, i),
    });
  }
  return list;
}

export const registrations: Registration[] = [
  // ev_1 is the busy, currently-running event: 62 of 100 seats taken.
  ...buildRegistrations('ev_1', 'VSN', 62, attendees, 60 * 26),
  // ev_2: three of our named attendees are in.
  ...buildRegistrations('ev_2', 'HTC', 23, attendees.slice(0, 3), 60 * 40),
  // ev_3: nobody we know has registered yet — gives the "Register" path a home.
  ...buildRegistrations('ev_3', 'DJF', 11, [], 60 * 12),
];

// --- check-ins -------------------------------------------------------------

/**
 * 47 of the 62 people registered for ev_1 are already inside, scanned over the
 * last ~90 minutes with a clear peak just before the start time.
 */
export const checkIns: CheckIn[] = registrations
  .filter((r) => r.eventId === 'ev_1')
  .slice(0, 47)
  .map((reg, i) => {
    // Bunch arrivals: most people turn up in the 30 minutes before the doors.
    const minutesAgo = Math.max(2, Math.round(95 - i * 1.9 - (i % 5)));
    return {
      id: `chk_${reg.id}`,
      eventId: reg.eventId,
      registrationId: reg.id,
      attendeeName: reg.attendeeName,
      checkedInAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
      method: (i % 17 === 0 ? 'MANUAL' : 'SCAN') as CheckIn['method'],
    };
  });
