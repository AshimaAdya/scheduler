/**
 * All user-facing copy lives here so future translation is a file swap, not a
 * refactor (Design direction v1). Rules: plain short sentences, ESL-friendly,
 * sentence case, verb-first buttons. Internal/engineering terms never appear.
 */

/** Working product name — a constant, never hardcoded in screens. */
export const APP_NAME = "ShiftCover";

export const strings = {
  appName: APP_NAME,

  common: {
    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    signOut: "Sign out",
    required: "This field is required.",
  },

  nav: {
    dashboard: "Dashboard",
    team: "Team",
    locations: "Locations",
  },

  manage: {
    title: "Manage",
    subtitle: "Set up your team and locations.",
  },

  locations: {
    title: "Locations",
    add: "Add location",
    empty: "No locations yet. Add your first one to get started.",
    nameLabel: "Location name",
    addressLabel: "Address (optional)",
    created: "Location added.",
    updated: "Location saved.",
  },

  team: {
    title: "Team",
    add: "Add person",
    count: (n: number) => `${n} ${n === 1 ? "person" : "people"}`,
    empty: "No team members yet. Add your first person to get started.",
    active: "Active",
    inactive: "Inactive",
    columns: {
      name: "Name",
      role: "Role",
      skills: "Skills",
      home: "Home",
      status: "Status",
    },
  },

  person: {
    addTitle: "Add a person",
    editTitle: "Edit person",
    inviteNote: "We'll email them an invite to set a password.",
    invited: "Invite sent.",
    saved: "Changes saved.",
    deactivate: "Deactivate",
    reactivate: "Reactivate",
    deactivateNote:
      "Deactivating removes them from scheduling and cover asks, but keeps their history.",
    fields: {
      name: "Full name",
      email: "Work email",
      phone: "Phone number",
      role: "Role",
      skills: "Skills",
      skillsHint: "Separate skills with commas, e.g. barista, cashier",
      maxHours: "Max hours per week",
      homeLocation: "Home location",
    },
    roles: {
      employee: "Employee",
      manager: "Manager",
      admin: "Admin",
    },
  },

  availability: {
    title: "When can you work?",
    managerTitle: "Availability",
    intro: "Set the times you're usually free. This helps build your schedule.",
    notAvailable: "Not available",
    addRange: "Add a time",
    save: "Save availability",
    saved: "Availability saved.",
    awayTitle: "Days I'm away",
    awayHint: "Add a specific date you can't work.",
    addAway: "Add a date I'm away",
    away: "Away",
    footnote: "Changes apply to next week's schedule onward.",
    gridTitle: "Team availability",
    gridEmpty: "No active team members at this location.",
  },
} as const;
