'use strict';
// Built-in ward-wide starter templates (spec: include a starter "Ward picnic" with default quantity slots).
// Seeded once into signup_templates if missing. Editing a template never changes events made from it:
// "create from template" copies the fields into a new draft event.
const STARTER_TEMPLATES = [
  {
    id: 'tpl_ward_picnic',
    org_id: null,
    builtin: true,
    name: 'Ward picnic',
    type: 'slots_plus_rsvp',
    title: 'Ward Picnic',
    description: 'Join us for the ward picnic! Please RSVP with your headcount (including guests) and sign up to bring something to share.',
    location: '',
    default_access_level: 'public',
    hide_names: false,
    allow_guests: true,
    guest_cap: 6,
    headcount_cap: 150,
    reminder_days_before: 2,
    noindex: true,
    slots: [
      { title: 'Main dish', help_comment: 'Serves 8 to 10', quantity_wanted: 6 },
      { title: 'Salad', help_comment: 'Serves 8 to 10', quantity_wanted: 4 },
      { title: 'Dessert', help_comment: 'Serves 8 to 10', quantity_wanted: 4 },
      { title: 'Drinks', help_comment: '1 to 2 gallons, or a case of water', quantity_wanted: 3 },
      { title: 'Paper goods and utensils', help_comment: 'Plates, cups, napkins, forks', quantity_wanted: 2 },
      { title: 'Setup help', help_comment: 'Arrive 30 minutes early', quantity_wanted: 4 },
      { title: 'Cleanup help', help_comment: 'Stay 30 minutes after', quantity_wanted: 4 },
    ],
    assets: [],
  },
];
module.exports = { STARTER_TEMPLATES };
