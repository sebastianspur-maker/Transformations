import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);
const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export type SchoolRole = "student" | "teacher";

const TEST_STUDENT_EMAIL = "tablethijes@gmail.com";

export function isStudentEmail(email?: string | null): boolean {
  const normalizedEmail = email?.toLowerCase();
  return Boolean(
    normalizedEmail?.endsWith("@s.michaelham.org.ar") ||
      normalizedEmail === TEST_STUDENT_EMAIL,
  );
}

export function isTeacherEmail(email?: string | null): boolean {
  return Boolean(email?.toLowerCase().endsWith("@t.michaelham.org.ar"));
}

export function isAllowedSchoolEmail(email?: string | null): boolean {
  return isStudentEmail(email) || isTeacherEmail(email);
}

export interface StudentData {
  id?: string;
  uid: string;
  name: string;
  email: string;
  school: string;
  year: string;
  isTeacher: boolean;
  role: SchoolRole;
  createdAt: Timestamp;
  lastActive: Timestamp;
}

export interface PracticeAttempt {
  id?: string;
  studentId: string;
  studentName: string;
  school: string;
  year: string;
  problemType: "translation" | "reflection" | "rotation" | "enlargement";
  problemDetails: string;
  isCorrect: boolean;
  attempts: number;
  timeSpent: number;
  timestamp: Timestamp;
}

export interface SessionStats {
  studentId: string;
  totalProblems: number;
  correctProblems: number;
  translationCorrect: number;
  translationTotal: number;
  reflectionCorrect: number;
  reflectionTotal: number;
  rotationCorrect: number;
  rotationTotal: number;
  enlargementCorrect: number;
  enlargementTotal: number;
}

export async function createOrUpdateStudent(data: {
  uid: string;
  name: string;
  email: string;
  school?: string;
  year?: string;
  isTeacher: boolean;
}): Promise<string> {
  const userRef = doc(db, "students", data.uid);
  const existing = await getDoc(userRef);
  const now = Timestamp.now();
  const role: SchoolRole = data.isTeacher ? "teacher" : "student";

  const profile = {
    uid: data.uid,
    name: data.name,
    email: data.email,
    school: data.school || "Michael Ham",
    year: data.year || "",
    isTeacher: data.isTeacher,
    role,
    lastActive: now,
  };

  if (existing.exists()) {
    await setDoc(userRef, profile, { merge: true });
  } else {
    await setDoc(userRef, { ...profile, createdAt: now });
  }

  return data.uid;
}

export async function updateStudentActivity(studentId: string): Promise<void> {
  const studentRef = doc(db, "students", studentId);
  await updateDoc(studentRef, { lastActive: Timestamp.now() });
}

export async function recordPracticeAttempt(attempt: Omit<PracticeAttempt, "id" | "timestamp">): Promise<void> {
  const attemptRef = doc(collection(db, "practiceAttempts"));
  await setDoc(attemptRef, {
    ...attempt,
    timestamp: Timestamp.now(),
  });

  try {
    await updateStudentActivity(attempt.studentId);
  } catch {
  }
}

export async function getStudentStats(studentId: string): Promise<SessionStats | null> {
  const q = query(collection(db, "practiceAttempts"), where("studentId", "==", studentId));
  const attempts = await getDocs(q);

  if (attempts.empty) return null;

  const stats: SessionStats = {
    studentId,
    totalProblems: 0,
    correctProblems: 0,
    translationCorrect: 0,
    translationTotal: 0,
    reflectionCorrect: 0,
    reflectionTotal: 0,
    rotationCorrect: 0,
    rotationTotal: 0,
    enlargementCorrect: 0,
    enlargementTotal: 0,
  };

  attempts.forEach((attemptDoc) => {
    const data = attemptDoc.data() as PracticeAttempt;
    stats.totalProblems++;
    if (data.isCorrect) stats.correctProblems++;

    switch (data.problemType) {
      case "translation":
        stats.translationTotal++;
        if (data.isCorrect) stats.translationCorrect++;
        break;
      case "reflection":
        stats.reflectionTotal++;
        if (data.isCorrect) stats.reflectionCorrect++;
        break;
      case "rotation":
        stats.rotationTotal++;
        if (data.isCorrect) stats.rotationCorrect++;
        break;
      case "enlargement":
        stats.enlargementTotal++;
        if (data.isCorrect) stats.enlargementCorrect++;
        break;
    }
  });

  return stats;
}

export async function getAllStudents(): Promise<StudentData[]> {
  const q = query(collection(db, "students"), where("isTeacher", "==", false), limit(250));
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((studentDoc) => ({ id: studentDoc.id, ...studentDoc.data() } as StudentData))
    .sort((a, b) => (b.lastActive?.toMillis?.() ?? 0) - (a.lastActive?.toMillis?.() ?? 0));
}

export async function getRecentAttempts(limitCount: number = 50): Promise<PracticeAttempt[]> {
  const q = query(collection(db, "practiceAttempts"), orderBy("timestamp", "desc"), limit(limitCount));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((attemptDoc) => ({ id: attemptDoc.id, ...attemptDoc.data() } as PracticeAttempt));
}

export async function getClassStats(): Promise<{
  totalStudents: number;
  totalAttempts: number;
  averageScore: number;
  topicStats: { topic: string; correct: number; total: number }[];
}> {
  const students = await getAllStudents();
  const attempts = await getRecentAttempts(1000);

  const topicStats: Record<string, { correct: number; total: number }> = {
    translation: { correct: 0, total: 0 },
    reflection: { correct: 0, total: 0 },
    rotation: { correct: 0, total: 0 },
    enlargement: { correct: 0, total: 0 },
  };

  attempts.forEach((attempt) => {
    topicStats[attempt.problemType].total++;
    if (attempt.isCorrect) topicStats[attempt.problemType].correct++;
  });

  const totalCorrect = attempts.filter((attempt) => attempt.isCorrect).length;

  return {
    totalStudents: students.length,
    totalAttempts: attempts.length,
    averageScore: attempts.length > 0 ? Math.round((totalCorrect / attempts.length) * 100) : 0,
    topicStats: Object.entries(topicStats).map(([topic, stats]) => ({
      topic,
      correct: stats.correct,
      total: stats.total,
    })),
  };
}

export { db, auth, googleProvider };
