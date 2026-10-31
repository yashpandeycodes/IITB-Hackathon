/**
 * Authoritative CIT Reference Lookup
 * Sourced from data/cit_public.json for client-side resolution of IDs to human-readable names.
 */

export interface StudentGroupRef {
  id: string;
  name: string;
  count?: number;
}

export interface RoomRef {
  id: string;
  name: string;
  type: string;
  capacity: number;
}

export interface FacultyRef {
  id: string;
  name: string;
  department: string;
}

export interface CourseRef {
  id: string;
  title: string;
}

export const STUDENT_GROUPS: StudentGroupRef[] = [
  {
    "id": "Y1-A",
    "name": "B.Tech Year 1, Section A"
  },
  {
    "id": "Y1-B",
    "name": "B.Tech Year 1, Section B"
  },
  {
    "id": "Y1-C",
    "name": "B.Tech Year 1, Section C"
  },
  {
    "id": "Y1-D",
    "name": "B.Tech Year 1, Section D"
  },
  {
    "id": "CSE-2",
    "name": "CSE Year 2"
  },
  {
    "id": "ECE-2",
    "name": "ECE Year 2"
  },
  {
    "id": "EE-2",
    "name": "EE Year 2"
  },
  {
    "id": "ME-2",
    "name": "ME Year 2"
  },
  {
    "id": "CE-2",
    "name": "CE Year 2"
  },
  {
    "id": "CSE-3",
    "name": "CSE Year 3"
  },
  {
    "id": "ECE-3",
    "name": "ECE Year 3"
  },
  {
    "id": "EE-3",
    "name": "EE Year 3"
  },
  {
    "id": "ME-3",
    "name": "ME Year 3"
  },
  {
    "id": "CE-3",
    "name": "CE Year 3"
  }
];

export const CAMPUS_ROOMS: RoomRef[] = [
  {
    "id": "AUD",
    "name": "Main Auditorium",
    "type": "auditorium",
    "capacity": 500
  },
  {
    "id": "LH-1",
    "name": "Lecture Hall 1",
    "type": "lecture_hall",
    "capacity": 200
  },
  {
    "id": "LH-2",
    "name": "Lecture Hall 2",
    "type": "lecture_hall",
    "capacity": 200
  },
  {
    "id": "LH-3",
    "name": "Lecture Hall 3",
    "type": "lecture_hall",
    "capacity": 120
  },
  {
    "id": "LH-4",
    "name": "Lecture Hall 4",
    "type": "lecture_hall",
    "capacity": 120
  },
  {
    "id": "LH-5",
    "name": "Lecture Hall 5",
    "type": "lecture_hall",
    "capacity": 120
  },
  {
    "id": "LH-6",
    "name": "Lecture Hall 6",
    "type": "lecture_hall",
    "capacity": 120
  },
  {
    "id": "CR-101",
    "name": "Classroom A-101",
    "type": "classroom",
    "capacity": 90
  },
  {
    "id": "CR-102",
    "name": "Classroom A-102",
    "type": "classroom",
    "capacity": 90
  },
  {
    "id": "CR-103",
    "name": "Classroom A-103",
    "type": "classroom",
    "capacity": 80
  },
  {
    "id": "CR-104",
    "name": "Classroom A-104",
    "type": "classroom",
    "capacity": 80
  },
  {
    "id": "CR-105",
    "name": "Classroom A-105",
    "type": "classroom",
    "capacity": 70
  },
  {
    "id": "CR-201",
    "name": "Classroom B-201",
    "type": "classroom",
    "capacity": 90
  },
  {
    "id": "CR-202",
    "name": "Classroom B-202",
    "type": "classroom",
    "capacity": 80
  },
  {
    "id": "CR-203",
    "name": "Classroom B-203",
    "type": "classroom",
    "capacity": 80
  },
  {
    "id": "CR-204",
    "name": "Classroom B-204",
    "type": "classroom",
    "capacity": 70
  },
  {
    "id": "CR-205",
    "name": "Classroom B-205",
    "type": "classroom",
    "capacity": 60
  },
  {
    "id": "SH-1",
    "name": "Seminar Hall 1",
    "type": "seminar_hall",
    "capacity": 150
  },
  {
    "id": "SH-2",
    "name": "Seminar Hall 2",
    "type": "seminar_hall",
    "capacity": 100
  },
  {
    "id": "OAT",
    "name": "Open Air Theatre",
    "type": "outdoor",
    "capacity": 800
  },
  {
    "id": "CS-LAB-1",
    "name": "Computing Lab 1",
    "type": "lab_cs",
    "capacity": 90
  },
  {
    "id": "CS-LAB-2",
    "name": "Computing Lab 2",
    "type": "lab_cs",
    "capacity": 90
  },
  {
    "id": "ELEC-LAB-1",
    "name": "Electronics Lab 1",
    "type": "lab_elec",
    "capacity": 80
  },
  {
    "id": "ELEC-LAB-2",
    "name": "Electronics Lab 2",
    "type": "lab_elec",
    "capacity": 80
  },
  {
    "id": "PHY-LAB",
    "name": "Physics Lab",
    "type": "lab_phy",
    "capacity": 90
  },
  {
    "id": "MECH-WS",
    "name": "Central Workshop",
    "type": "workshop",
    "capacity": 90
  },
  {
    "id": "CIVIL-LAB",
    "name": "Civil Engineering Lab",
    "type": "lab_civil",
    "capacity": 60
  }
];

export const FACULTY_MEMBERS: FacultyRef[] = [
  {
    "id": "F01",
    "name": "Dr. Ananya Mishra",
    "department": "CSE"
  },
  {
    "id": "F02",
    "name": "Dr. Rohit Sahoo",
    "department": "CSE"
  },
  {
    "id": "F03",
    "name": "Dr. Kavya Iyer",
    "department": "CSE"
  },
  {
    "id": "F04",
    "name": "Dr. Sandeep Patnaik",
    "department": "CSE"
  },
  {
    "id": "F05",
    "name": "Dr. Meera Nair",
    "department": "CSE"
  },
  {
    "id": "F06",
    "name": "Dr. Arjun Mehta",
    "department": "CSE"
  },
  {
    "id": "F07",
    "name": "Dr. Pooja Das",
    "department": "CSE"
  },
  {
    "id": "F08",
    "name": "Prof. Vikram Rao (Visiting)",
    "department": "CSE"
  },
  {
    "id": "F09",
    "name": "Dr. Ishita Banerjee",
    "department": "ECE"
  },
  {
    "id": "F10",
    "name": "Dr. Suresh Pradhan",
    "department": "ECE"
  },
  {
    "id": "F11",
    "name": "Dr. Neha Kulkarni",
    "department": "ECE"
  },
  {
    "id": "F12",
    "name": "Dr. Amit Behera",
    "department": "ECE"
  },
  {
    "id": "F13",
    "name": "Dr. Ritu Sharma",
    "department": "ECE"
  },
  {
    "id": "F14",
    "name": "Dr. Kunal Joshi",
    "department": "EE"
  },
  {
    "id": "F15",
    "name": "Dr. Sneha Mohanty",
    "department": "EE"
  },
  {
    "id": "F16",
    "name": "Dr. Rakesh Panda",
    "department": "EE"
  },
  {
    "id": "F17",
    "name": "Dr. Divya Menon",
    "department": "EE"
  },
  {
    "id": "F18",
    "name": "Dr. Manoj Tripathy",
    "department": "EE"
  },
  {
    "id": "F19",
    "name": "Dr. Shalini Gupta",
    "department": "MA"
  },
  {
    "id": "F20",
    "name": "Dr. Prakash Nayak",
    "department": "MA"
  },
  {
    "id": "F21",
    "name": "Dr. Lakshmi Reddy",
    "department": "PH"
  },
  {
    "id": "F22",
    "name": "Dr. Harish Dash",
    "department": "PH"
  },
  {
    "id": "F23",
    "name": "Dr. Farah Khan",
    "department": "PH"
  },
  {
    "id": "F24",
    "name": "Dr. Gaurav Jena",
    "department": "PH"
  },
  {
    "id": "F25",
    "name": "Dr. Tanvi Desai",
    "department": "ME"
  },
  {
    "id": "F26",
    "name": "Dr. Abhishek Rout",
    "department": "ME"
  },
  {
    "id": "F27",
    "name": "Dr. Sunita Bose",
    "department": "ME"
  },
  {
    "id": "F28",
    "name": "Dr. Nikhil Swain",
    "department": "ME"
  },
  {
    "id": "F29",
    "name": "Dr. Priya Raman",
    "department": "ME"
  },
  {
    "id": "F30",
    "name": "Dr. Debashish Sethi",
    "department": "ME"
  },
  {
    "id": "F31",
    "name": "Dr. Anjali Verma",
    "department": "CE"
  },
  {
    "id": "F32",
    "name": "Dr. Sameer Khuntia",
    "department": "CE"
  },
  {
    "id": "F33",
    "name": "Dr. Rekha Pillai",
    "department": "CE"
  },
  {
    "id": "F34",
    "name": "Dr. Varun Acharya",
    "department": "CE"
  },
  {
    "id": "F35",
    "name": "Dr. Bhavna Saxena",
    "department": "CE"
  },
  {
    "id": "F36",
    "name": "Dr. Ashok Mahapatra",
    "department": "HSS"
  },
  {
    "id": "F37",
    "name": "Prof. Shreya Kapoor (Dean)",
    "department": "ADMIN"
  },
  {
    "id": "F38",
    "name": "Dr. Imran Qureshi",
    "department": "HSS"
  },
  {
    "id": "F39",
    "name": "Dr. Radhika Hegde",
    "department": "HSS"
  },
  {
    "id": "F40",
    "name": "Dr. Om Prakash Sahu",
    "department": "HSS"
  }
];

export const COURSES: CourseRef[] = [
  {
    "id": "MA101",
    "title": "Calculus and Linear Algebra"
  },
  {
    "id": "PH101",
    "title": "Engineering Physics"
  },
  {
    "id": "PH191",
    "title": "Physics Laboratory"
  },
  {
    "id": "CS101",
    "title": "Programming in C"
  },
  {
    "id": "CS191",
    "title": "Programming Laboratory"
  },
  {
    "id": "WS101",
    "title": "Engineering Workshop"
  },
  {
    "id": "HS101",
    "title": "Communicative English"
  },
  {
    "id": "ID101",
    "title": "Introduction to Engineering"
  },
  {
    "id": "CS201",
    "title": "Data Structures"
  },
  {
    "id": "CS202",
    "title": "Discrete Mathematics"
  },
  {
    "id": "CS203",
    "title": "Digital Logic Design"
  },
  {
    "id": "CS204",
    "title": "Object-Oriented Programming"
  },
  {
    "id": "CS291",
    "title": "Data Structures Lab"
  },
  {
    "id": "CS292",
    "title": "Digital Logic Lab"
  },
  {
    "id": "EC201",
    "title": "Signals and Systems"
  },
  {
    "id": "EC202",
    "title": "Network Theory"
  },
  {
    "id": "EC203",
    "title": "Electronic Devices"
  },
  {
    "id": "EC204",
    "title": "Probability and Random Processes"
  },
  {
    "id": "EC291",
    "title": "Electronic Devices Lab"
  },
  {
    "id": "EC292",
    "title": "Programming Lab"
  },
  {
    "id": "EE201",
    "title": "Circuit Analysis"
  },
  {
    "id": "EE202",
    "title": "Electrical Machines I"
  },
  {
    "id": "EE203",
    "title": "Electrical Measurements"
  },
  {
    "id": "EE204",
    "title": "Electromagnetic Fields"
  },
  {
    "id": "EE291",
    "title": "Measurements Lab"
  },
  {
    "id": "EE292",
    "title": "Machines Lab"
  },
  {
    "id": "ME201",
    "title": "Engineering Thermodynamics"
  },
  {
    "id": "ME202",
    "title": "Mechanics of Solids"
  },
  {
    "id": "ME203",
    "title": "Kinematics of Machines"
  },
  {
    "id": "ME204",
    "title": "Manufacturing Processes"
  },
  {
    "id": "ME291",
    "title": "Workshop Practice II"
  },
  {
    "id": "ME292",
    "title": "Materials Testing Lab"
  },
  {
    "id": "CE201",
    "title": "Surveying"
  },
  {
    "id": "CE202",
    "title": "Fluid Mechanics"
  },
  {
    "id": "CE203",
    "title": "Strength of Materials"
  },
  {
    "id": "CE204",
    "title": "Engineering Geology"
  },
  {
    "id": "CE291",
    "title": "Surveying Lab"
  },
  {
    "id": "CE292",
    "title": "Fluid Mechanics Lab"
  },
  {
    "id": "HS201",
    "title": "Principles of Economics"
  },
  {
    "id": "CS301",
    "title": "Operating Systems"
  },
  {
    "id": "CS302",
    "title": "Database Systems"
  },
  {
    "id": "CS303",
    "title": "Computer Networks"
  },
  {
    "id": "CS391",
    "title": "Systems Lab"
  },
  {
    "id": "EC301",
    "title": "Communication Systems"
  },
  {
    "id": "EC302",
    "title": "Digital Signal Processing"
  },
  {
    "id": "EC303",
    "title": "VLSI Design"
  },
  {
    "id": "EC391",
    "title": "Communication Lab"
  },
  {
    "id": "EE301",
    "title": "Power Systems"
  },
  {
    "id": "EE302",
    "title": "Control Systems"
  },
  {
    "id": "EE303",
    "title": "Power Electronics"
  },
  {
    "id": "EE391",
    "title": "Power Lab"
  },
  {
    "id": "ME301",
    "title": "Heat Transfer"
  },
  {
    "id": "ME302",
    "title": "Machine Design"
  },
  {
    "id": "ME303",
    "title": "Fluid Machines"
  },
  {
    "id": "ME391",
    "title": "Thermal Lab"
  },
  {
    "id": "CE301",
    "title": "Structural Analysis"
  },
  {
    "id": "CE302",
    "title": "Geotechnical Engineering"
  },
  {
    "id": "CE303",
    "title": "Transportation Engineering"
  },
  {
    "id": "CE391",
    "title": "Structures Lab"
  },
  {
    "id": "OE301",
    "title": "Introduction to Finance"
  },
  {
    "id": "OE302",
    "title": "Data Visualisation"
  },
  {
    "id": "OE303",
    "title": "Technical Writing"
  }
];

const groupMap = new Map<string, StudentGroupRef>(STUDENT_GROUPS.map((g) => [g.id, g]));
const roomMap = new Map<string, RoomRef>(CAMPUS_ROOMS.map((r) => [r.id, r]));
const facultyMap = new Map<string, FacultyRef>(FACULTY_MEMBERS.map((f) => [f.id, f]));
const courseMap = new Map<string, CourseRef>(COURSES.map((c) => [c.id, c]));

export function getGroupName(id: string): string {
  return groupMap.get(id)?.name ?? id;
}

export function getRoomName(id: string): string {
  return roomMap.get(id)?.name ?? id;
}

export function getRoomCapacity(id: string): number {
  return roomMap.get(id)?.capacity ?? 100;
}

export function getFacultyName(id: string): string {
  return facultyMap.get(id)?.name ?? id;
}

export function getFacultyDepartment(id: string): string {
  return facultyMap.get(id)?.department ?? 'CIT';
}

export function getCourseTitle(id: string): string {
  return courseMap.get(id)?.title ?? id;
}
