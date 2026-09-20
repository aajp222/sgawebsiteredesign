-- =============================================================================
-- WPI SGA — seed
--
-- Loads the content that is currently hard-coded in the HTML, so switching a
-- page over to the database does not lose anything. Safe to re-run: every
-- insert is guarded.
--
-- Officer accounts are NOT seeded — see db/README.md for adding the first one.
-- =============================================================================

insert into public.news (title, body, kind, link_url, link_label, published, published_at, sort)
select * from (values
  ('Governing documents under review',
   'Senate is discussing a restructuring of SGA''s governing documents. Proposals are debated in open session — come weigh in before anything is ratified.',
   'announcement', 'governing-documents.html', 'Read the documents', true, now(), 30),
  ('Senate meets Tuesdays at 6 PM',
   'Innovation Studio 203. Public comment opens every meeting — bring a concern, a question, or just listen in.',
   'recurring', 'meetings.html', 'Meeting details', true, now(), 20),
  ('WPI Running Club',
   'Meets daily at 5 PM for runs between two and six miles. All skill and experience levels are welcome — no tryouts, no pace requirement.',
   'spotlight', 'resources.html', 'More clubs', true, now(), 10)
) as v(title, body, kind, link_url, link_label, published, published_at, sort)
where not exists (select 1 from public.news);

insert into public.people (name, role_title, branch, email, bio, sort, published)
select * from (values
  ('', 'President', 'executive', 'sgapresident@wpi.edu',
   'Chief representative of the student body. Sets SGA''s priorities for the year and serves as the primary liaison to WPI administration.', 10, false),
  ('', 'Vice President', 'executive', 'sgavp@wpi.edu',
   'Manages Senate operations and committee assignments, keeping the legislative side of SGA running.', 20, false),
  ('', 'Secretary', 'executive', 'sgasecretary@wpi.edu',
   'Keeps SGA''s records, publishes meeting minutes, and handles official communications.', 30, false),
  ('', 'Treasurer', 'executive', 'sgatreasurer@wpi.edu',
   'Oversees SGA finances and chairs the Financial Board, which decides how student activity funds are allocated.', 40, false),
  ('', 'Chief Justice', 'judicial', null,
   'Leads the Judicial Branch and interprets SGA''s governing documents when their meaning or application is in question.', 50, false)
) as v(name, role_title, branch, email, bio, sort, published)
where not exists (select 1 from public.people);

-- Published false: these are role placeholders until real names are filled in,
-- so the site keeps showing its static markup until someone completes them.

insert into public.documents (title, description, category, sort, published)
select * from (values
  ('Constitution', 'Establishes SGA, the three branches, and the rights it exists to protect.', 'governing', 10, false),
  ('Bylaws', 'Operating rules for Senate, committees, elections, and membership.', 'governing', 20, false),
  ('Financial governance', 'How the Financial Board allocates funds and what organizations must do to receive them.', 'governing', 30, false),
  ('Judicial procedures', 'How the Judicial Branch interprets the documents and resolves disputes.', 'governing', 40, false)
) as v(title, description, category, sort, published)
where not exists (select 1 from public.documents);
