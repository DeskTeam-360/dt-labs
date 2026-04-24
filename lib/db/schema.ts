/**
 * Drizzle schema — PostgreSQL tables used by the app.
 */
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

const ts = (name: string) => timestamp(name, { withTimezone: true })

// ============ Users ============
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash'),
  firstName: varchar('first_name', { length: 255 }),
  lastName: varchar('last_name', { length: 255 }),
  fullName: varchar('full_name', { length: 255 }),
  avatarUrl: text('avatar_url'),
  role: varchar('role', { length: 50 }).notNull().default('user'),
  permissions: jsonb('permissions'),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  isEmailVerified: boolean('is_email_verified').default(false),
  lastLoginAt: ts('last_login_at'),
  lastActiveAt: ts('last_active_at'),
  phone: varchar('phone', { length: 20 }),
  department: varchar('department', { length: 100 }),
  position: varchar('position', { length: 100 }),
  bio: text('bio'),
  timezone: varchar('timezone', { length: 50 }).default('UTC'),
  locale: varchar('locale', { length: 10 }).default('en'),
  metadata: jsonb('metadata'),
  companyId: uuid('company_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  deletedAt: ts('deleted_at'),
})

// ============ Companies ============
export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  isActive: boolean('is_active').default(true),
  email: varchar('email', { length: 255 }),
  /** Domain list: emails with these domains belong to this company. E.g. ['acme.com','acme.co.id'] */
  domainList: text('domain_list').array().default([]),
  color: varchar('color', { length: 20 }).default('#000000'),
  activeTeamId: uuid('active_team_id'),
  activeManagerId: uuid('active_manager_id'),
  activeTime: integer('active_time').notNull().default(0),
  isCustomer: boolean('is_customer').notNull().default(false),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

/** Company Log: end-of-day snapshot of companies.active_*; one row per company per UTC calendar day (cron + manual). */
export const companyDailyActiveAssignments = pgTable(
  'company_daily_active_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    snapshotDate: date('snapshot_date').notNull(),
    activeTeamId: uuid('active_team_id'),
    activeManagerId: uuid('active_manager_id'),
    activeTime: integer('active_time').notNull().default(0),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('company_daily_active_assignments_company_id_snapshot_date_key').on(
      t.companyId,
      t.snapshotDate
    ),
    index('company_daily_active_assignments_snapshot_date_idx').on(t.snapshotDate),
  ]
)

/** member | company_admin — company_admin can add portal users & reset their passwords */
export const companyUsers = pgTable(
  'company_users',
  {
    companyId: uuid('company_id').notNull(),
    userId: uuid('user_id').notNull(),
    companyRole: varchar('company_role', { length: 32 }).notNull().default('member'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.userId] })]
)

export const companyDataTemplates = pgTable('company_data_templates', {
  id: varchar('id', { length: 255 }).primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  group: varchar('group', { length: 100 }),
  isActive: boolean('is_active').default(true),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const companyDatas = pgTable(
  'company_datas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    dataTemplateId: varchar('data_template_id', { length: 255 }).notNull(),
    value: text('value'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('company_datas_company_id_data_template_id_key').on(t.companyId, t.dataTemplateId)]
)

// ============ Teams ============
export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 100 }),
  createdBy: uuid('created_by').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
})

export const teamMembers = pgTable(
  'team_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: uuid('team_id').notNull(),
    userId: uuid('user_id').notNull(),
    role: varchar('role', { length: 50 }).default('member'),
    joinedAt: ts('joined_at').notNull().defaultNow(),
  },
  (t) => [unique('team_members_team_id_user_id_key').on(t.teamId, t.userId)]
)

// ============ Ticket Types, Priorities, Tags ============
export const ticketTypes = pgTable('ticket_types', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  slug: varchar('slug', { length: 50 }).notNull().unique(),
  title: varchar('title', { length: 100 }).notNull(),
  /** Shown on the Reference page and in glossary-style help. */
  description: text('description').default(''),
  color: varchar('color', { length: 20 }).default('#000000'),
  sortOrder: integer('sort_order').default(0),
  companyId: uuid('company_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const ticketPriorities = pgTable('ticket_priorities', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  slug: varchar('slug', { length: 50 }).notNull().unique(),
  title: varchar('title', { length: 100 }).notNull(),
  /** Shown on the Reference page and in glossary-style help. */
  description: text('description').default(''),
  color: varchar('color', { length: 20 }).default('#000000'),
  sortOrder: integer('sort_order').default(0),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  color: varchar('color', { length: 20 }).default('#000000'),
  companyId: uuid('company_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const ticketStatuses = pgTable('ticket_statuses', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  slug: varchar('slug', { length: 50 }).notNull().unique(),
  title: varchar('title', { length: 100 }).notNull(),
  description: text('description').default(''),
  customerTitle: varchar('customer_title', { length: 255 }),
  color: varchar('color', { length: 20 }).notNull(),
  showInKanban: boolean('show_in_kanban').default(true),
  /** When false, API and UI must not allow deleting this row (seeded / system statuses). */
  isDeletable: boolean('is_deletable').notNull().default(true),
  /** When false, hidden from status pickers and default kanban; existing tickets keep slug. */
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').default(0),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

// ============ Tickets ============
export const tickets = pgTable('tickets', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  shortNote: text('short_note'),
  createdBy: uuid('created_by'),
  /** Customer-facing email reply recipient when set; otherwise use createdBy. */
  contactUserId: uuid('contact_user_id'),
  dueDate: ts('due_date'),
  status: varchar('status', { length: 50 }).notNull().default('open'),
  visibility: varchar('visibility', { length: 50 }).notNull().default('private'),
  teamId: uuid('team_id'),
  gmailThreadId: varchar('gmail_thread_id', { length: 255 }),
  priorityId: integer('priority_id').references(() => ticketPriorities.id, { onDelete: 'restrict' }),
  createdVia: varchar('created_via', { length: 50 }),
  lastReadAt: ts('last_read_at'),
  typeId: integer('type_id').references(() => ticketTypes.id, { onDelete: 'restrict' }),
  /** support | spam | trash — not `type_id` (ticket_types catalog) */
  ticketType: varchar('ticket_type', { length: 32 }).notNull().default('support'),
  companyId: uuid('company_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const ticketAssignees = pgTable(
  'ticket_assignees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: integer('ticket_id').notNull(),
    userId: uuid('user_id').notNull(),
    createdAt: ts('created_at').defaultNow(),
    updatedAt: ts('updated_at').defaultNow(),
  },
  (t) => [unique('ticket_assignees_ticket_id_user_id_key').on(t.ticketId, t.userId)]
)

export const ticketChecklist = pgTable('ticket_checklist', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: integer('ticket_id').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  isCompleted: boolean('is_completed').default(false),
  orderIndex: integer('order_index').default(0),
  createdAt: ts('created_at').notNull().defaultNow(),
})

export const ticketComments = pgTable('ticket_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: integer('ticket_id').notNull(),
  userId: uuid('user_id').notNull(),
  comment: text('comment').notNull(),
  visibility: text('visibility').default('note'),
  authorType: text('author_type').default('agent'),
  /** For notes: user IDs tagged (non-customer users to notify) */
  taggedUserIds: uuid('tagged_user_ids').array(),
  /** For replies: CC and BCC emails when sending via email integration */
  ccEmails: text('cc_emails').array(),
  bccEmails: text('bcc_emails').array(),
  createdAt: ts('created_at').notNull().defaultNow(),
})

/** Append-only audit trail for ticket lifecycle (create/update/delete, comments, automation, email). */
export const ticketActivityLog = pgTable(
  'ticket_activity_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** SET NULL when ticket row is deleted so history rows remain. */
    ticketId: integer('ticket_id').references(() => tickets.id, { onDelete: 'set null' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorRole: varchar('actor_role', { length: 32 }).notNull().default('agent'),
    action: varchar('action', { length: 64 }).notNull(),
    metadata: jsonb('metadata'),
    relatedCommentId: uuid('related_comment_id').references(() => ticketComments.id, {
      onDelete: 'set null',
    }),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('ticket_activity_log_ticket_id_created_at_idx').on(t.ticketId, t.createdAt)]
)

export const ticketAttributs = pgTable(
  'ticket_attributs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: integer('ticket_id').notNull(),
    metaKey: varchar('meta_key', { length: 255 }).notNull(),
    metaValue: text('meta_value'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('ticket_attributs_ticket_id_meta_key_key').on(t.ticketId, t.metaKey)]
)

/** timer = start/stop clock; manual = user-entered duration (always completed rows) */
export const ticketTimeTrackerTypes = ['timer', 'manual'] as const
export type TicketTimeTrackerType = (typeof ticketTimeTrackerTypes)[number]

/** Work category for time sessions; slug stored on tracker (no join for list rows). */
export const jobTypes = pgTable('job_types', {
  slug: varchar('slug', { length: 64 }).primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: ts('created_at').notNull().defaultNow(),
})

export const ticketTimeTracker = pgTable('ticket_time_tracker', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: integer('ticket_id').notNull(),
  userId: uuid('user_id').notNull(),
  /** timer | manual — enables parallel timer sessions across tickets; manual rows are closed entries */
  trackerType: varchar('tracker_type', { length: 32 }).notNull().default('timer'),
  /** job_types.slug — what this session was for (string; title resolved in API via catalog map). */
  jobType: varchar('job_type', { length: 64 }).references(() => jobTypes.slug, { onDelete: 'set null' }),
  startTime: ts('start_time').notNull(),
  stopTime: ts('stop_time'),
  durationSeconds: integer('duration_seconds'),
  /** Reporting/billable seconds; defaults to duration_seconds; admin/manager may override. */
  durationAdjustment: integer('duration_adjustment'),
  createdAt: ts('created_at').notNull().defaultNow(),
})

export const ticketTags = pgTable(
  'ticket_tags',
  {
    ticketId: integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'restrict' }),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.ticketId, t.tagId] })]
)

export const ticketAttachments = pgTable('ticket_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: integer('ticket_id').notNull(),
  fileUrl: text('file_url').notNull(),
  fileName: text('file_name').notNull(),
  filePath: text('file_path').notNull(),
  uploadedBy: uuid('uploaded_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
})

/** All emails ever CC'd on this ticket - used to auto-CC on future replies */
export const ticketCcRecipients = pgTable(
  'ticket_cc_recipients',
  {
    ticketId: integer('ticket_id').notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [unique('ticket_cc_recipients_ticket_email').on(t.ticketId, t.email)]
)

export const commentAttachments = pgTable('comment_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  commentId: uuid('comment_id').notNull(),
  fileUrl: text('file_url').notNull(),
  fileName: text('file_name').notNull(),
  filePath: text('file_path').notNull(),
  uploadedBy: uuid('uploaded_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
})

// ============ Screenshots ============
export const screenshots = pgTable('screenshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  filePath: text('file_path').notNull(),
  fileUrl: text('file_url').notNull(),
  fileSize: bigint('file_size', { mode: 'number' }),
  mimeType: varchar('mime_type', { length: 100 }),
  ticketId: integer('ticket_id'),
  projectId: uuid('project_id'),
  title: varchar('title', { length: 255 }),
  description: text('description'),
  tags: text('tags').array(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

// ============ Website Crawl ============
export const companyWebsites = pgTable('company_websites', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull(),
  url: text('url').notNull(),
  title: varchar('title', { length: 255 }),
  description: text('description'),
  isPrimary: boolean('is_primary').default(false),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const crawlSessions = pgTable('crawl_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyWebsiteId: uuid('company_website_id').notNull(),
  status: varchar('status', { length: 50 }).default('pending'),
  totalPages: integer('total_pages').default(0),
  crawledPages: integer('crawled_pages').default(0),
  failedPages: integer('failed_pages').default(0),
  uncrawledPages: integer('uncrawled_pages').default(0),
  brokenPages: integer('broken_pages').default(0),
  errorMessage: text('error_message'),
  maxDepth: integer('max_depth').default(3),
  maxPages: integer('max_pages').default(100),
  startedAt: ts('started_at'),
  completedAt: ts('completed_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const crawlPages = pgTable('crawl_pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  crawlSessionId: uuid('crawl_session_id').notNull(),
  url: text('url').notNull(),
  title: varchar('title', { length: 255 }),
  description: text('description'),
  depth: integer('depth').default(0),
  status: varchar('status', { length: 50 }).default('pending'),
  httpStatusCode: integer('http_status_code'),
  errorMessage: text('error_message'),
  contentType: varchar('content_type', { length: 255 }),
  headingHierarchy: jsonb('heading_hierarchy'),
  metaTags: jsonb('meta_tags'),
  links: jsonb('links'),
  crawledAt: ts('crawled_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const companyKnowledgeBases = pgTable('company_knowledge_bases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id'),
    type: text('type'),
    content: text('content'),
    sourceIds: text('source_ids').array(),
    contentTemplateId: uuid('content_template_id'),
    usedFields: text('used_fields').array(),
    embedding: jsonb('embedding'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('company_knowledge_bases_company_template_key').on(t.companyId, t.contentTemplateId)]
)

// ============ Knowledge Base Articles (edukasi customer) ============
export const knowledgeBaseArticles = pgTable('knowledge_base_articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 500 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('draft'),
  description: text('description'),
  category: varchar('category', { length: 100 }).default('general'),
  sortOrder: integer('sort_order').default(0),
  /** If null or empty, published article is visible to every role. Otherwise only these roles. */
  targetRoles: text('target_roles').array(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const aiTokenUsage = pgTable('ai_token_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  usedFor: varchar('used_for', { length: 100 }).notNull(),
  aiModel: varchar('ai_model', { length: 100 }).notNull(),
  aiVersion: varchar('ai_version', { length: 50 }),
  generatedDate: ts('generated_date').notNull().defaultNow(),
  contentText: text('content_text'),
  promptId: uuid('prompt_id'),
  vectorReferenceId: uuid('vector_reference_id'),
  promptTokens: integer('prompt_tokens').default(0),
  completionTokens: integer('completion_tokens').default(0),
  totalTokens: integer('total_tokens').default(0),
  companyId: uuid('company_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
})

// ============ Email ============
export const emailIntegrations = pgTable('email_integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: varchar('provider', { length: 50 }).notNull().unique().default('google'),
  emailAddress: varchar('email_address', { length: 255 }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt: ts('expires_at'),
  isActive: boolean('is_active').default(true),
  lastSyncAt: ts('last_sync_at'),
  createdBy: uuid('created_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const emailMessages = pgTable('email_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  gmailMessageId: varchar('gmail_message_id', { length: 255 }).notNull().unique(),
  threadId: varchar('thread_id', { length: 255 }),
  fromEmail: varchar('from_email', { length: 255 }),
  toEmail: varchar('to_email', { length: 255 }),
  subject: text('subject'),
  snippet: text('snippet'),
  ticketId: integer('ticket_id'),
  direction: varchar('direction', { length: 20 }).notNull(),
  rfcMessageId: varchar('rfc_message_id', { length: 512 }),
  syncedAt: ts('synced_at').notNull().defaultNow(),
  createdAt: ts('created_at').notNull().defaultNow(),
})

export const emailSkipList = pgTable('email_skip_list', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  reason: text('reason'),
  createdAt: ts('created_at').notNull().defaultNow(),
})

/** Incoming Webhook per rule → one Slack channel; filter JSON matches ticket dimensions & events */
export const slackTicketNotificationRules = pgTable('slack_ticket_notification_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }),
  webhookUrl: text('webhook_url').notNull(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  filter: jsonb('filter').notNull().default({}),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

// ============ Automation Rules ============
export const automationRules = pgTable('automation_rules', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: varchar('name', { length: 255 }),
  eventType: varchar('event_type', { length: 50 }).notNull().default('ticket_created'),
  conditions: jsonb('conditions').notNull().default({}),
  actions: jsonb('actions').notNull().default({}),
  priority: integer('priority').notNull().default(0),
  companyId: uuid('company_id'),
  status: boolean('status').notNull().default(true),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

// ============ API Tokens ============
/** Email / notification / reply templates (seeded; admin edits content & active flag only). */
export const messageTemplates = pgTable(
  'message_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: varchar('type', { length: 64 }).notNull(),
    templateGroup: varchar('template_group', { length: 128 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    key: varchar('key', { length: 128 }).notNull().unique(),
    status: varchar('status', { length: 32 }).notNull().default('active'),
    content: text('content'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('message_templates_template_group_idx').on(t.templateGroup),
    index('message_templates_type_idx').on(t.type),
  ]
)

export const apiTokens = pgTable('api_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  token: varchar('token', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).default('Chrome Extension'),
  lastUsedAt: ts('last_used_at'),
  expiresAt: ts('expires_at'),
  isActive: boolean('is_active').default(true),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

/** Singleton row: global running-text announcement (see GLOBAL_ANNOUNCEMENT_ROW_ID). */
export const globalAnnouncement = pgTable('global_announcement', {
  id: uuid('id').primaryKey(),
  message: text('message').notNull().default(''),
  isEnabled: boolean('is_enabled').notNull().default(false),
  startsAt: ts('starts_at'),
  endsAt: ts('ends_at'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
})

/** Named filter presets for Customer time report (global for managers/admins); multiple rows after migration 023. */
export const customerTimeReportDefaults = pgTable('customer_time_report_defaults', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  /** Label shown in the Saved filters control and when saving. */
  title: varchar('title', { length: 200 }).notNull().default('Saved filter'),
  filters: jsonb('filters').notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
})

/** Customer time report — saved recap (full month, full ISO week, or custom range). */
export const recapSnapshots = pgTable(
  'recap_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 500 }).notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    periodType: varchar('period_type', { length: 16 }).notNull(),
    teamIds: jsonb('team_ids').notNull().$type<string[]>(),
    teamKey: varchar('team_key', { length: 2000 }).notNull(),
    payload: jsonb('payload').notNull(),
    createdBy: uuid('created_by'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('recap_snapshots_upsert_idx').on(t.teamKey, t.periodStart, t.periodEnd, t.title),
    index('recap_snapshots_period_idx').on(t.periodStart, t.periodEnd),
  ]
)

/** Customer weekly recap: one row per team × company × ISO week (materialized; gray weeks = not embedded). */
export const customerWeeklyRecapCells = pgTable(
  'customer_weekly_recap_cells',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    weekStart: date('week_start').notNull(),
    weekEnd: date('week_end').notNull(),
    isoYear: integer('iso_year').notNull(),
    isoWeek: integer('iso_week').notNull(),
    isEmbedded: boolean('is_embedded').notNull().default(false),
    /** Sum of `active_time` (hours) from company_daily rows where active_team_id = team_id for that week. */
    clientTimeHours: integer('client_time_hours').notNull().default(0),
    trackerReportedSeconds: bigint('tracker_reported_seconds', { mode: 'number' }).notNull().default(0),
    computedAt: ts('computed_at').notNull().defaultNow(),
  },
  (t) => [
    unique('customer_weekly_recap_cells_team_company_week_uid').on(t.teamId, t.companyId, t.weekStart),
    index('customer_weekly_recap_cells_team_week_idx').on(t.teamId, t.weekStart),
    index('customer_weekly_recap_cells_company_idx').on(t.companyId),
  ]
)

/** Dashboard announcements: title preview on dashboard, full body in modal; optional role targeting (see KB roles). */
export const dashboardAnnouncements = pgTable('dashboard_announcements', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 500 }).notNull(),
  body: text('body').notNull().default(''),
  /** Null or empty = all roles; else only listed roles (lowercase). */
  targetRoles: text('target_roles').array(),
  isPublished: boolean('is_published').notNull().default(false),
  startsAt: ts('starts_at'),
  endsAt: ts('ends_at'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
})
