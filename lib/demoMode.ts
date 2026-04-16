export const isDemoMode = process.env.DEMO_MODE === "true";

export const DEMO_USER = {
  name: "Demo User",
  email: "demo@itu.int",
  userId: "demo-user-001",
  image: null,
};

export function getDemoMeetings() {
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  return [
    {
      id: "demo-1",
      subject: "Spectrum Allocation Working Group",
      start: `${today}T10:00:00Z`,
      end: `${today}T11:30:00Z`,
      platform: "teams",
      attendees: [
        { name: "Karim El-Sayed", email: "karim@itu.int" },
        { name: "Yuki Tanaka", email: "yuki@itu.int" },
        { name: "Sarah Mitchell", email: "sarah@itu.int" },
      ],
      organizer: { name: "Demo User", email: "demo@itu.int" },
      joinUrl: "https://teams.microsoft.com/demo",
      isOngoing: true,
    },
    {
      id: "demo-2",
      subject: "AI Governance Task Force",
      start: `${today}T14:00:00Z`,
      end: `${today}T15:00:00Z`,
      platform: "zoom",
      attendees: [
        { name: "Doreen Bogdan-Martin", email: "doreen@itu.int" },
        { name: "Marco Silva", email: "marco@itu.int" },
      ],
      organizer: { name: "Demo User", email: "demo@itu.int" },
      joinUrl: null,
      isOngoing: false,
    },
    {
      id: "demo-3",
      subject: "Innovation Hub Weekly Sync",
      start: `${today}T16:00:00Z`,
      end: `${today}T16:30:00Z`,
      platform: "meet",
      attendees: [
        { name: "Chris Clark", email: "chris@itu.int" },
        { name: "Marion Aveline", email: "marion@itu.int" },
        { name: "Bhanuka Kirinde", email: "bhanuka@itu.int" },
      ],
      organizer: { name: "Demo User", email: "demo@itu.int" },
      joinUrl: null,
      isOngoing: false,
    },
  ];
}
