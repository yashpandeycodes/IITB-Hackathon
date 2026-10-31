/**
 * CIT Nexus - Illustrative Mock Data
 * 
 * IMPORTANT: This data is strictly for frontend demonstration and visual prototyping.
 * It is not connected to a backend, database, or live campus scheduling solver.
 */

export interface TimetableSlot {
  id: string;
  courseCode: string;
  courseName: string;
  faculty: string;
  venue: string;
  capacity: number;
  enrolled: number;
  timeSlot: string;
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri';
  status: 'In Session' | 'Confirmed' | 'Exam Window' | 'Pending Review';
  tag: 'Core' | 'Elective' | 'Lab' | 'Exam';
}

export interface CampusVenue {
  id: string;
  name: string;
  category: 'Lecture Hall' | 'Computing Lab' | 'Auditorium' | 'Seminar Hall' | 'Specialized Lab';
  capacity: number;
  features: string[];
  currentStatus: 'Available' | 'Occupied' | 'Reserved' | 'Maintenance';
  nextAvailable: string;
  block: string;
  utilizationRate: number;
}

export interface BookingRequest {
  id: string;
  title: string;
  requestedBy: string;
  role: 'Club Representative' | 'Faculty' | 'Department Coordinator' | 'Admin';
  venue: string;
  date: string;
  timeRange: string;
  attendees: number;
  status: 'Draft Analyzed' | 'Constraint Checked' | 'Approved' | 'Requires Review';
  constraintScore: number;
  notes: string;
}

export interface DisruptionScenario {
  triggerVenue: string;
  triggerReason: string;
  triggerTime: string;
  affectedClass: {
    code: string;
    name: string;
    faculty: string;
    students: number;
    originalVenue: string;
  };
  repairRecommendation: {
    recommendedVenue: string;
    capacityDelta: string;
    distance: string;
    avCompatibility: string;
    cascadeConflictsCount: number;
    confidenceScore: number;
    resolutionNotes: string;
  };
  rejectedCandidates: Array<{
    venue: string;
    reason: string;
  }>;
}

export const MOCK_TIMETABLE: TimetableSlot[] = [
  {
    id: 'slot-1',
    courseCode: 'CS-301',
    courseName: 'Advanced Algorithms & Complexity',
    faculty: 'Prof. Ananya Ray',
    venue: 'LH 204 (Aryabhatta Block)',
    capacity: 90,
    enrolled: 82,
    timeSlot: '08:30 – 10:00',
    day: 'Mon',
    status: 'In Session',
    tag: 'Core',
  },
  {
    id: 'slot-2',
    courseCode: 'EC-204',
    courseName: 'Digital Signal Processing',
    faculty: 'Prof. Subrat Nayak',
    venue: 'LH 102 (Bhabha Block)',
    capacity: 75,
    enrolled: 68,
    timeSlot: '10:15 – 11:45',
    day: 'Mon',
    status: 'Confirmed',
    tag: 'Core',
  },
  {
    id: 'slot-3',
    courseCode: 'CS-342',
    courseName: 'Distributed Systems & Cloud',
    faculty: 'Dr. Tanmoy Patnaik',
    venue: 'Turing Computing Lab',
    capacity: 65,
    enrolled: 60,
    timeSlot: '12:00 – 13:30',
    day: 'Tue',
    status: 'Confirmed',
    tag: 'Lab',
  },
  {
    id: 'slot-4',
    courseCode: 'EXAM-M24',
    courseName: 'Mid-Semester Examination Slot A',
    faculty: 'Academic Examination Board',
    venue: 'Sarabhai Central Auditorium',
    capacity: 450,
    enrolled: 420,
    timeSlot: '14:00 – 16:30',
    day: 'Wed',
    status: 'Exam Window',
    tag: 'Exam',
  },
  {
    id: 'slot-5',
    courseCode: 'ME-405',
    courseName: 'Computational Fluid Dynamics',
    faculty: 'Prof. K. Mishra',
    venue: 'CAD Simulation Lab 2',
    capacity: 50,
    enrolled: 46,
    timeSlot: '10:15 – 11:45',
    day: 'Thu',
    status: 'Confirmed',
    tag: 'Elective',
  },
  {
    id: 'slot-6',
    courseCode: 'AI-410',
    courseName: 'Neural Networks & Deep Learning',
    faculty: 'Dr. Pradeep Sen',
    venue: 'Seminar Hall 1 (Raman Block)',
    capacity: 120,
    enrolled: 110,
    timeSlot: '14:00 – 15:30',
    day: 'Fri',
    status: 'Confirmed',
    tag: 'Elective',
  },
];

export const MOCK_VENUES: CampusVenue[] = [
  {
    id: 'v-1',
    name: 'Lecture Hall 204',
    category: 'Lecture Hall',
    capacity: 90,
    features: ['Dual 4K Projectors', 'Wireless Mic', 'Acoustic Wall', 'Climate Control'],
    currentStatus: 'Occupied',
    nextAvailable: '10:00 AM',
    block: 'Aryabhatta Block, Floor 2',
    utilizationRate: 88,
  },
  {
    id: 'v-2',
    name: 'Turing Computing Lab',
    category: 'Computing Lab',
    capacity: 65,
    features: ['65x RTX 4080 Nodes', 'Gigabit Uplink', 'Air Purified', 'Smart Whiteboard'],
    currentStatus: 'Reserved',
    nextAvailable: '11:45 AM',
    block: 'Turing Centre, Floor 1',
    utilizationRate: 94,
  },
  {
    id: 'v-3',
    name: 'Sarabhai Central Auditorium',
    category: 'Auditorium',
    capacity: 450,
    features: ['Dolby Stage Audio', 'Tiered Ergonomic Seating', 'Live Broadcast Console', 'Green Rooms'],
    currentStatus: 'Available',
    nextAvailable: 'Immediate',
    block: 'Central Campus Quad',
    utilizationRate: 62,
  },
  {
    id: 'v-4',
    name: 'Seminar Hall 1',
    category: 'Seminar Hall',
    capacity: 120,
    features: ['Hybrid Telepresence', 'Automated Recording', 'Podium Controls', 'VIP Anteroom'],
    currentStatus: 'Available',
    nextAvailable: 'Immediate',
    block: 'Raman Block, Floor 3',
    utilizationRate: 74,
  },
  {
    id: 'v-5',
    name: 'CAD Simulation Lab 2',
    category: 'Specialized Lab',
    capacity: 50,
    features: ['Engineering Workstations', '3D Scanners', 'Interactive Display'],
    currentStatus: 'Occupied',
    nextAvailable: '13:30 PM',
    block: 'Visvesvaraya Wing, Floor 2',
    utilizationRate: 81,
  },
  {
    id: 'v-6',
    name: 'Lecture Hall 102',
    category: 'Lecture Hall',
    capacity: 75,
    features: ['High-Lumen Projector', 'Lapel Mic System', 'Tiered Desks'],
    currentStatus: 'Available',
    nextAvailable: 'Immediate',
    block: 'Bhabha Block, Floor 1',
    utilizationRate: 69,
  },
];

export const MOCK_REQUESTS: BookingRequest[] = [
  {
    id: 'req-01',
    title: 'Autonomous Drone Swarm Demonstration & Workshop',
    requestedBy: 'Aditi Rao',
    role: 'Club Representative',
    venue: 'Turing Computing Lab',
    date: 'Friday, 16:00 – 18:30',
    timeRange: '2.5 hrs',
    attendees: 55,
    status: 'Constraint Checked',
    constraintScore: 98,
    notes: 'Zero timetable overlaps detected. Club quota verified by system rules.',
  },
  {
    id: 'req-02',
    title: 'Distinguished Alumni Lecture: Dr. K. Radhakrishnan',
    requestedBy: 'Prof. B. Mohanty',
    role: 'Department Coordinator',
    venue: 'Sarabhai Central Auditorium',
    date: 'Thursday, 14:00 – 16:00',
    timeRange: '2.0 hrs',
    attendees: 380,
    status: 'Approved',
    constraintScore: 100,
    notes: 'All prerequisite approvals complete. Schedule broadcasted to dept portal.',
  },
  {
    id: 'req-03',
    title: 'Inter-College Competitive Programming Sprint',
    requestedBy: 'Rohan Panda',
    role: 'Club Representative',
    venue: 'Seminar Hall 1',
    date: 'Saturday, 09:00 – 17:00',
    timeRange: '8.0 hrs',
    attendees: 110,
    status: 'Requires Review',
    constraintScore: 85,
    notes: 'Weekend power & security staffing clearance pending admin authorization.',
  },
];

export const MOCK_DISRUPTION: DisruptionScenario = {
  triggerVenue: 'Lecture Hall 204',
  triggerReason: 'Sudden HVAC Compressor Failure — High Temperature Alert',
  triggerTime: '10:15 AM – 11:45 AM slot',
  affectedClass: {
    code: 'CS-301',
    name: 'Advanced Algorithms & Complexity',
    faculty: 'Prof. Ananya Ray',
    students: 82,
    originalVenue: 'LH 204',
  },
  repairRecommendation: {
    recommendedVenue: 'Seminar Hall 1 (Raman Block)',
    capacityDelta: '+38 seats headroom (Cap: 120 vs 82 required)',
    distance: '45m via Skybridge corridor (1.5 min walk)',
    avCompatibility: '100% (Dual 4K Projector + Lapel Audio verified)',
    cascadeConflictsCount: 0,
    confidenceScore: 99.4,
    resolutionNotes: 'No ripple disruptions to downstream classes or faculty schedules.',
  },
  rejectedCandidates: [
    {
      venue: 'Sarabhai Auditorium (Cap 450)',
      reason: 'Excessive capacity footprint; pre-booked for Exam Slot at 14:00.',
    },
    {
      venue: 'LH 102 (Cap 75)',
      reason: 'Hard capacity violation (75 capacity < 82 enrolled students).',
    },
    {
      venue: 'CAD Lab 2 (Cap 50)',
      reason: 'Wrong room pedagogy type (computer workstations vs lecture theory).',
    },
  ],
};

export const CAMPUS_METRICS = {
  totalRoomsManaged: 68,
  activeTeachingHours: '08:00 – 19:30',
  scheduledSessionsWeekly: 1420,
  averageConflictResolutionSecs: 1.4,
  conflictPreventionAccuracy: '99.8%',
  resourceUtilizationGain: '+24.5%',
};

export const CORE_MODULES = [
  {
    id: 'timetabling',
    title: 'Intelligent Timetabling',
    subtitle: 'Zero-clash curriculum orchestration',
    description: 'Coordinate teaching sessions, faculty bandwidth, student cohorts, rooms and laboratories while respecting hard institutional constraints and pedagogy needs.',
    badge: 'CORE ENGINE',
    accentColor: '#66E3F0',
    features: [
      'Multi-cohort conflict matrix checking',
      'Faculty preference & workload balance weights',
      'Lab equipment & batch size compatibility',
      'Dynamic break & transit travel buffers',
    ],
    technicalDetail: 'Rule-based evaluation matrix with zero non-deterministic hall overlaps.',
  },
  {
    id: 'exams',
    title: 'Exam Planning',
    subtitle: 'High-stakes spatial seating and invigilation',
    description: 'Plan comprehensive examination sessions with automated room suitability, invigilator ratio compliance, seating distance constraints, and conflict avoidance.',
    badge: 'ACADEMIC INTEGRITY',
    accentColor: '#8279FF',
    features: [
      'Staggered batch spacing algorithms',
      'Invigilator allocation & duty balance',
      'Secure exam-hall perimeter isolation',
      'Instant roll-number seating generation',
    ],
    technicalDetail: 'Guarantees no student sits consecutive 3-hour slots on the same day.',
  },
  {
    id: 'venue-management',
    title: 'Venue & Event Management',
    subtitle: 'Structured institutional workflows',
    description: 'Streamline ad-hoc venue requisitions for guest symposiums, hackathons, department activities, and student societies through a transparent multi-tier approvals hierarchy.',
    badge: 'OPERATIONS',
    accentColor: '#38BDF8',
    features: [
      'Automated quota tracking by society',
      'Transparent status tracking for student reps',
      'Equipment & AV crew requirement dispatch',
      'VIP guest security and logistical flagging',
    ],
    technicalDetail: 'Enforces human authorization boundaries before locking calendar slots.',
  },
  {
    id: 'disruption-repair',
    title: 'Disruption Repair',
    subtitle: 'Instant cascade-minimizing recovery',
    description: 'When unforeseen incidents strike—from air conditioning downtime to faculty emergencies—CIT Nexus computes minimally invasive alternative rooms with zero cascade chaos.',
    badge: 'RESILIENCE',
    accentColor: '#F59E0B',
    features: [
      'Single-click alternative routing calculation',
      'Minimal student transit distance optimization',
      'Preservation of downstream schedules',
      'Broadcast push alerts to enrolled students',
    ],
    technicalDetail: 'Minimizes displacement score while maintaining room capacity constraints.',
  },
  {
    id: 'ai-copilot',
    title: 'AI Copilot',
    subtitle: 'Natural language interface with strict validation',
    description: 'Turn unstructured text requests into strictly verified booking drafts. The AI assists in understanding and formulating requests, while deterministic validation rules and authorized humans hold the final veto.',
    badge: 'AUGMENTED INTEL',
    accentColor: '#10B981',
    features: [
      'Converts conversational emails into structured requisitions',
      'Identifies implicit equipment needs (mics, beamers)',
      'Human-in-the-loop review interface',
      'Explainable conflict feedback diagnostics',
    ],
    technicalDetail: 'Non-authoritative parsing layer; all approvals require human coordinator signoff.',
  },
];

export const CAMPUS_RESOURCES = [
  {
    category: 'Lecture Theatres',
    count: '24 Halls',
    specs: 'Capacities 75 – 180',
    status: 'High Demand',
    iconName: 'Building2',
    tags: ['Acoustic Tiered', '4K Projection', 'Lecture Capture'],
  },
  {
    category: 'Computing & AI Labs',
    count: '16 Facilities',
    specs: '1,200 High-End Workstations',
    status: 'GPU Cluster Synced',
    iconName: 'Cpu',
    tags: ['NVIDIA AI Nodes', 'Linux Kernel Env', 'Low Latency LAN'],
  },
  {
    category: 'Engineering & Hardware Labs',
    count: '12 Centers',
    specs: 'Robotics, IoT, CAD, Wind Tunnel',
    status: 'Safety Certified',
    iconName: 'Wrench',
    tags: ['Heavy Power Line', 'Ventilation Hoods', '3D Fabrication'],
  },
  {
    category: 'Auditoriums & Amphitheatres',
    count: '4 Complexes',
    specs: 'Capacities 300 – 1,200',
    status: 'Key Events Ready',
    iconName: 'Sparkles',
    tags: ['Dolby Stage Audio', 'Green Rooms', 'VIP Foyers'],
  },
  {
    category: 'Seminar & Board Rooms',
    count: '14 Rooms',
    specs: 'Capacities 25 – 60',
    status: 'VC Active',
    iconName: 'Users2',
    tags: ['Cisco Telepresence', 'Automated Minutes', 'Executive Desks'],
  },
  {
    category: 'Outdoor & Event Arenas',
    count: '6 Grounds',
    specs: 'Quad, Stadium, Open Air Theatre',
    status: 'Festival Ready',
    iconName: 'MapPin',
    tags: ['High Voltage Power', 'Crowd Buffers', 'Emergency Access'],
  },
];

export const USER_ROLES = [
  {
    role: 'Admin',
    badge: 'SYSTEM OVERSEER',
    description: 'Oversees institute-wide scheduling, campus policies, global hard constraints, term calendars, and system-wide audit telemetry.',
    scope: 'Full Institute Scope',
    permissionsSummary: 'Configuration of academic rules, term dates, venue master registry, and supervisor overrides.',
    iconName: 'ShieldCheck',
  },
  {
    role: 'Department Coordinator',
    badge: 'ACADEMIC PLANNER',
    description: 'Coordinates departmental batch timetables, laboratory cohorts, elective allocations, and reviews club venue requests in department spaces.',
    scope: 'Department & Program Level',
    permissionsSummary: 'Curriculum mapping, faculty course assignment, venue review, and exam slot curation.',
    iconName: 'Network',
  },
  {
    role: 'Faculty Member',
    badge: 'EDUCATOR & RESEARCHER',
    description: 'Inspects real-time personalized teaching schedules, submits ad-hoc review requests, books consultation chambers, and flags unexpected room maintenance.',
    scope: 'Assigned Courses & Labs',
    permissionsSummary: 'Personal schedule view, rescheduling proposals, attendance venue sync, and equipment requests.',
    iconName: 'GraduationCap',
  },
  {
    role: 'Club Representative',
    badge: 'STUDENT INITIATIVES',
    description: 'Submits structured venue requisitions for technical hackathons, cultural festivals, workshops, and monitors approval progression in real time.',
    scope: 'Co-Curricular & Student Bodies',
    permissionsSummary: 'Draft venue requests, track approval pipeline, query space availability, and log attendee counts.',
    iconName: 'Layers',
  },
];

