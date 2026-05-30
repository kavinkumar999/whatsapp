// The recipient list. Edit this array, then run `npm run recipients:seed` to
// upload it to Upstash. Each entry is either:
//   - a number string, digits only:        "919876543210"
//   - a group jid ending in @g.us:          "120363048321604084@g.us"
//   - an object with an optional name:      { to: "919876543210", name: "Asha" }
// `name` fills in {{name}} in the message (blank when omitted).
//
// Groups: the linked account must already be a member. Find a group's jid with
// `npm run group-id -- --list` or `npm run group-id -- <invite-url>`.

export default [
  { to: '120363048321604084@g.us' },
];
