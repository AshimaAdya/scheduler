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

  import: {
    link: "Import CSV",
    title: "Import team from CSV",
    subtitle: "Upload a CSV to add many people at once. We'll email each an invite.",
    downloadTemplate: "Download template",
    choose: "Choose a CSV file",
    preview: "Preview",
    confirm: "Import valid rows",
    importing: "Importing…",
    columns: { line: "Line", name: "Name", email: "Email", status: "Status" },
    ok: "Will import",
    duplicate: "Skipped — already exists",
    error: "Has a problem",
    summary: (ok: number, dup: number, err: number) =>
      `${ok} to import · ${dup} duplicate · ${err} with problems`,
    done: (imported: number, skipped: number, failed: number) =>
      `Imported ${imported}. Skipped ${skipped}. Failed ${failed}.`,
    nothingValid: "No valid rows to import.",
  },

  settings: {
    title: "Settings",
    subtitle: "How scheduling and cover asks work for your business.",
    saved: "Settings saved.",
    save: "Save settings",
    approvalLabel: "Review schedules before they go out",
    approvalHint: "On means you approve each week. Off publishes automatically.",
    approvalOn: "Review before publishing",
    approvalOff: "Publish automatically",
    sickTier1: "Sick call — ask the home team first for (minutes)",
    sickTier2: "Sick call — then other locations for (minutes)",
    dayoffTier1: "Planned day off — ask the home team first for (minutes)",
    dayoffTier2: "Planned day off — then other locations for (minutes)",
    windowsNote:
      "New timings apply to new requests only. Requests already finding cover keep the timing they started with.",
    timezone: "Timezone",
    notifChannel: "How to reach your team by default",
    notifFrom: "Sender name",
    channels: {
      email: "Email",
      sms: "Text message",
      both: "Text and email",
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

  patterns: {
    title: "Shift patterns",
    subtitle: "The weekly shifts each location needs. The schedule fills these with people.",
    add: "Add a pattern",
    addTitle: "Add a shift pattern",
    editTitle: "Edit shift pattern",
    empty: "No shift patterns yet. Add one to describe a weekly shift.",
    inactive: "Off",
    fields: {
      location: "Location",
      weekdays: "Days",
      weekday: "Day",
      start: "Start time",
      end: "End time",
      skill: "Skill needed",
      skillHint: "e.g. barista, cashier, supervisor",
      headcount: "How many people",
    },
    saved: "Pattern saved.",
    turnOff: "Turn off",
    turnOn: "Turn on",
    offNote: "Turning a pattern off stops it generating shifts, but keeps it for later.",
  },

  schedule: {
    title: "Schedule",
    subtitle: "Generate and publish the weekly schedule for a location.",
    location: "Location",
    week: "Week starting (Monday)",
    show: "Show",
    generate: "Generate",
    regenerate: "Re-generate draft",
    publish: "Publish",
    none: "No schedule for this week yet. Generate one to get started.",
    draft: "Draft",
    published: "Published",
    assigned: "Assigned",
    unfilled: "Unfilled",
    autoNote: "Auto-publish is on, so generating publishes right away.",
    reviewNote: "Review the draft, then publish when you're ready.",
    publishedNote: "Published. Assigned employees have been notified.",
    publishedLocked:
      "This week is published — re-generating is disabled. Edits happen on the published schedule.",
  },
} as const;
