/**
 * Development seed.
 *
 * Recreates the demo cast the UI was built around: two organizers, a crowd of
 * attendees, three events, and a half-full check-in list so the dashboard has
 * something to show.
 *
 * It DELETES everything first, so it is for local development only — the guard
 * below refuses to run in production.
 *
 *   npm run db:seed
 */
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'mic12345';

function at(dayOffset: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function qrToken(): string {
  return randomBytes(32).toString('base64url');
}

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
  'Gaurav Sinha', 'Ira Chatterjee', 'Mohit Saxena',
];

function emailFor(name: string, index: number): string {
  const handle = name.toLowerCase().split(' ')[0];
  return `${handle}${index}@student.mic.dev`;
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed: NODE_ENV is production (this script deletes all rows).');
  }

  console.log('Clearing existing rows…');
  await prisma.checkIn.deleteMany();
  await prisma.registration.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();

  // One hash reused across seeded accounts: bcrypt is deliberately slow, and
  // every demo account shares the same password anyway.
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  console.log('Creating users…');
  const [aditi, rahul] = await Promise.all([
    prisma.user.create({
      data: { name: 'Aditi Rao', email: 'aditi@mic.dev', passwordHash, role: Role.ORGANIZER },
    }),
    prisma.user.create({
      data: { name: 'Rahul Menon', email: 'rahul@mic.dev', passwordHash, role: Role.ORGANIZER },
    }),
  ]);

  const namedAttendees = await Promise.all(
    [
      ['Sneha Iyer', 'sneha@student.mic.dev'],
      ['Karthik Nair', 'karthik@student.mic.dev'],
      ['Meera Joseph', 'meera@student.mic.dev'],
      ['Arjun Das', 'arjun@student.mic.dev'],
      ['Fatima Sheikh', 'fatima@student.mic.dev'],
    ].map(([name, email]) =>
      prisma.user.create({ data: { name, email, passwordHash, role: Role.ATTENDEE } }),
    ),
  );

  const fillerAttendees = await Promise.all(
    fillerNames.map((name, i) =>
      prisma.user.create({
        data: { name, email: emailFor(name, i), passwordHash, role: Role.ATTENDEE },
      }),
    ),
  );

  const attendees = [...namedAttendees, ...fillerAttendees];

  console.log('Creating events…');
  const vitsion = await prisma.event.create({
    data: {
      name: 'VITSION Screening Night',
      description:
        'Short films made by students this semester, on the big screen. Doors open 30 minutes early — snacks on us until they run out.',
      venue: 'Anna Auditorium',
      startsAt: at(0, 18, 30),
      endsAt: at(0, 21, 0),
      capacity: 100,
      organizerId: aditi.id,
    },
  });

  const hackathon = await prisma.event.create({
    data: {
      name: 'Hack the Campus — Kickoff',
      description:
        'Team forming, problem statements and the rules for the 24-hour build. Bring a laptop and one idea you actually care about.',
      venue: 'Tech Park Seminar Hall',
      startsAt: at(3, 10, 0),
      endsAt: at(3, 13, 0),
      capacity: 60,
      organizerId: aditi.id,
    },
  });

  const designJam = await prisma.event.create({
    data: {
      name: 'Design Jam: Figma Basics',
      description:
        'A hands-on session for anyone who has never opened Figma. We build one screen together, start to finish.',
      venue: 'Innovation Lab 2',
      startsAt: at(8, 16, 0),
      endsAt: at(8, 18, 0),
      capacity: 40,
      organizerId: rahul.id,
    },
  });

  console.log('Creating registrations…');
  // 62 of the 100 seats for tonight's screening; the named attendees are first
  // so demo logins always have a ticket to open.
  const vitsionRegistrations = await Promise.all(
    attendees.slice(0, 62).map((user, i) =>
      prisma.registration.create({
        data: {
          eventId: vitsion.id,
          userId: user.id,
          qrToken: qrToken(),
          createdAt: new Date(Date.now() - (26 * 60 + i * 37) * 60_000),
        },
      }),
    ),
  );

  await Promise.all(
    attendees.slice(0, 23).map((user, i) =>
      prisma.registration.create({
        data: {
          eventId: hackathon.id,
          userId: user.id,
          qrToken: qrToken(),
          createdAt: new Date(Date.now() - (40 * 60 + i * 29) * 60_000),
        },
      }),
    ),
  );

  // Nobody we know has taken a Design Jam seat, so the "Register" path has a
  // home in the demo.
  await Promise.all(
    attendees.slice(20, 31).map((user, i) =>
      prisma.registration.create({
        data: {
          eventId: designJam.id,
          userId: user.id,
          qrToken: qrToken(),
          createdAt: new Date(Date.now() - (12 * 60 + i * 45) * 60_000),
        },
      }),
    ),
  );

  console.log('Creating check-ins…');
  // 47 people already inside, arriving in a rush before the doors.
  await Promise.all(
    vitsionRegistrations.slice(0, 47).map((registration, i) =>
      prisma.checkIn.create({
        data: {
          registrationId: registration.id,
          checkedInAt: new Date(Date.now() - Math.max(2, Math.round(95 - i * 1.9 - (i % 5))) * 60_000),
          stationId: i % 3 === 0 ? 'door-b' : 'door-a',
        },
      }),
    ),
  );

  const counts = {
    users: await prisma.user.count(),
    events: await prisma.event.count(),
    registrations: await prisma.registration.count(),
    checkIns: await prisma.checkIn.count(),
  };
  console.log('Seed complete:', counts);
  console.log(`Demo password for every seeded account: ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
