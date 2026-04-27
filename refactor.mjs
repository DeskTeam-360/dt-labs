import fs from 'fs';
import path from 'path';

const SRC_DIR = 'c:/Deskteam360/my-app';

// First, let's build a map of where everything currently is, and where it will be.
const MOVE_MAP = {
  // Loose files -> automation
  'components/ActionBuilder.tsx': 'components/automation/ActionBuilder.tsx',
  'components/ConditionBuilder.tsx': 'components/automation/ConditionBuilder.tsx',
  
  // Loose files -> common
  'components/AppTable.tsx': 'components/common/AppTable.tsx',
  'components/DateDisplay.tsx': 'components/common/DateDisplay.tsx',
  'components/SpaNavLink.tsx': 'components/common/SpaNavLink.tsx',
  'components/ThemeToggle.tsx': 'components/common/ThemeToggle.tsx',
  
  // Loose files -> layout
  'components/AdminMainColumn.tsx': 'components/layout/AdminMainColumn.tsx',
  'components/AdminSidebar.tsx': 'components/layout/AdminSidebar.tsx',
  'components/CustomerNavbar.tsx': 'components/layout/CustomerNavbar.tsx',
  'components/GlobalAnnouncementBar.tsx': 'components/layout/GlobalAnnouncementBar.tsx',
  'components/TicketSearchNavbar.tsx': 'components/layout/TicketSearchNavbar.tsx',
  
  // Loose files -> providers
  'components/AntdProvider.tsx': 'components/providers/AntdProvider.tsx',
  'components/FirebaseSessionBridge.tsx': 'components/providers/FirebaseSessionBridge.tsx',
  'components/NotificationPollProvider.tsx': 'components/providers/NotificationPollProvider.tsx',
  'components/QueryProvider.tsx': 'components/providers/QueryProvider.tsx',
  'components/SessionAccessGuard.tsx': 'components/providers/SessionAccessGuard.tsx',
  'components/ThemeProvider.tsx': 'components/providers/ThemeProvider.tsx',
  
  // Loose files -> dashboard
  'components/DashboardAnnouncementsSection.tsx': 'components/dashboard/DashboardAnnouncementsSection.tsx',
  'components/DashboardHourlyActivityCard.tsx': 'components/dashboard/DashboardHourlyActivityCard.tsx',
  
  // Loose files -> knowledge-base
  'components/KnowledgeBaseArticleDetail.tsx': 'components/knowledge-base/KnowledgeBaseArticleDetail.tsx',
  'components/KnowledgeBaseArticleForm.tsx': 'components/knowledge-base/KnowledgeBaseArticleForm.tsx',
  
  // Loose files -> message-template
  'components/MessageTemplatePlaceholdersPanel.tsx': 'components/message-template/MessageTemplatePlaceholdersPanel.tsx',
  'components/MessageTemplatePreviewModal.tsx': 'components/message-template/MessageTemplatePreviewModal.tsx',
  
  // Loose files -> customer-portal
  'components/CustomerPortalTeamSection.tsx': 'components/customer-portal/CustomerPortalTeamSection.tsx',

  // Loose files -> ticket
  'components/TicketDetailContentClient.tsx': 'components/ticket/TicketDetailContentClient.tsx',
  'components/TicketActivityActorAvatar.tsx': 'components/ticket/TicketActivityActorAvatar.tsx',
  'components/TicketNotificationBell.tsx': 'components/ticket/TicketNotificationBell.tsx',
  'components/TicketPresenceBar.tsx': 'components/ticket/TicketPresenceBar.tsx',

  // loose file -> company
  'components/confirm-user-company-move.tsx': 'components/company/confirm-user-company-move.tsx',

  // Content files
  'components/content/CompaniesContent.tsx': 'components/content/company/CompaniesContent.tsx',
  'components/content/CompanyDetailContent.tsx': 'components/content/company/CompanyDetailContent.tsx',
  'components/content/CompanyLogSettingsContent.tsx': 'components/content/company/CompanyLogSettingsContent.tsx',
  
  'components/content/CrawlSessionDetailContent.tsx': 'components/content/crawl/CrawlSessionDetailContent.tsx',
  'components/content/CrawlSessionsContent.tsx': 'components/content/crawl/CrawlSessionsContent.tsx',
  
  'components/content/CustomerCompanySettingsContent.tsx': 'components/content/customer/CustomerCompanySettingsContent.tsx',
  'components/content/CustomerDashboardContent.tsx': 'components/content/customer/CustomerDashboardContent.tsx',
  'components/content/CustomerTimeReportContent.tsx': 'components/content/customer/CustomerTimeReportContent.tsx',
  'components/content/CustomerWeeklyRecapSettingsContent.tsx': 'components/content/customer/CustomerWeeklyRecapSettingsContent.tsx',
  
  'components/content/DashboardAnnouncementsSettingsContent.tsx': 'components/content/dashboard/DashboardAnnouncementsSettingsContent.tsx',
  'components/content/DashboardContent.tsx': 'components/content/dashboard/DashboardContent.tsx',
  
  'components/content/KnowledgeBaseContent.tsx': 'components/content/knowledge-base/KnowledgeBaseContent.tsx',
  
  'components/content/MessageTemplateEditContent.tsx': 'components/content/message-template/MessageTemplateEditContent.tsx',
  'components/content/MessageTemplatesContent.tsx': 'components/content/message-template/MessageTemplatesContent.tsx',
  
  'components/content/AutomationRulesContent.tsx': 'components/content/settings/AutomationRulesContent.tsx',
  'components/content/ChangePasswordContent.tsx': 'components/content/settings/ChangePasswordContent.tsx',
  'components/content/EmailIntegrationContent.tsx': 'components/content/settings/EmailIntegrationContent.tsx',
  'components/content/GlobalAnnouncementSettingsContent.tsx': 'components/content/settings/GlobalAnnouncementSettingsContent.tsx',
  'components/content/ProfileContent.tsx': 'components/content/settings/ProfileContent.tsx',
  'components/content/RecapSnapshotsSettingsContent.module.css': 'components/content/settings/RecapSnapshotsSettingsContent.module.css',
  'components/content/RecapSnapshotsSettingsContent.tsx': 'components/content/settings/RecapSnapshotsSettingsContent.tsx',
  'components/content/ScreenshotsContent.tsx': 'components/content/settings/ScreenshotsContent.tsx',
  'components/content/SettingsContent.tsx': 'components/content/settings/SettingsContent.tsx',
  'components/content/SlackNotificationRulesContent.tsx': 'components/content/settings/SlackNotificationRulesContent.tsx',
  'components/content/TagsContent.tsx': 'components/content/settings/TagsContent.tsx',
  'components/content/TicketReferenceContent.tsx': 'components/content/settings/TicketReferenceContent.tsx',
  
  'components/content/MyTeamsContent.tsx': 'components/content/team/MyTeamsContent.tsx',
  'components/content/TeamDetailContent.tsx': 'components/content/team/TeamDetailContent.tsx',
  'components/content/TeamsContent.tsx': 'components/content/team/TeamsContent.tsx',
  
  'components/content/TicketActivityHistoryContent.tsx': 'components/content/ticket/TicketActivityHistoryContent.tsx',
  'components/content/TicketDetailContent.tsx': 'components/content/ticket/TicketDetailContent.tsx',
  'components/content/TicketPrioritiesContent.tsx': 'components/content/ticket/TicketPrioritiesContent.tsx',
  'components/content/TicketStatusesContent.tsx': 'components/content/ticket/TicketStatusesContent.tsx',
  'components/content/TicketTypesContent.tsx': 'components/content/ticket/TicketTypesContent.tsx',
  'components/content/TicketsContent.tsx': 'components/content/ticket/TicketsContent.tsx',
  
  'components/content/UserDetailContent.tsx': 'components/content/user/UserDetailContent.tsx',
  'components/content/UsersContent.tsx': 'components/content/user/UsersContent.tsx',
};

const DIRS_MAP = {
  'components/CompanyDetail': 'components/company',
  'components/TicketDetail': 'components/ticket/detail',
  'components/Tickets': 'components/ticket/list',
};

// Normalize relative imports BEFORE moving anything
function normalizeRelativeImports() {
  console.log("Phase 1: Normalizing relative imports bounding out of their directory...");
  function walk(dir) {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      if (file === 'node_modules' || file === '.next' || file === '.git') continue;
      const full = path.join(dir, file);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
      } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
        let content = fs.readFileSync(full, 'utf8');
        let changed = false;
        
        // Match things like `import X from '../AdminMainColumn'`
        // Because moving them will break `../`. Convert `../` inside components/ to `@/components/`
        // We only care about this if the file is inside `components/`
        if (full.replace(/\\/g, '/').includes('/components/')) {
           const lines = content.split('\n');
           for(let i=0; i<lines.length; i++) {
             let line = lines[i];
             // If it has import ... from '../Something' or '../../Something'
             if (line.match(/from\s+['"]\.\.[\.\/a-zA-Z0-9_-]+['"]/)) {
               const relativePathMatch = line.match(/from\s+['"](\.\.[\.\/a-zA-Z0-9_-]+)['"]/);
               if (relativePathMatch) {
                 const relativePath = relativePathMatch[1];
                 const fileDir = path.dirname(full);
                 const absolutePath = path.resolve(fileDir, relativePath);
                 
                 // if the absolute path is inside our SRC_DIR
                 if (absolutePath.replace(/\\/g, '/').startsWith(SRC_DIR.replace(/\\/g, '/'))) {
                   let aliasPath = absolutePath.replace(/\\/g, '/').replace(SRC_DIR.replace(/\\/g, '/'), '@');
                   if (aliasPath.startsWith('@/')) {
                     // valid alias
                     content = content.replace(relativePathMatch[0], `from '${aliasPath}'`);
                     changed = true;
                   }
                 }
               }
             }
           }
        }
        
        if (changed) {
          fs.writeFileSync(full, content, 'utf8');
          console.log(`Normalized relative imports in ${full}`);
        }
      }
    }
  }
  walk(SRC_DIR);
}

// Ensure directory safely
function ensureDir(p) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Remove empty directories recursively
function removeEmptyDirs(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) removeEmptyDirs(full);
  }
  if (fs.readdirSync(dir).length === 0) {
    try { fs.rmdirSync(dir); } catch(e) {}
  }
}

// Generate replacement pairs
function generateReplacements() {
  const repls = [];
  
  // Combine all maps
  const fullMap = { ...MOVE_MAP };
  for (const [k, v] of Object.entries(DIRS_MAP)) {
    fullMap[k] = v;
  }
  
  // Also add `components/confirm-user-company-move` without extension
  fullMap['components/confirm-user-company-move'] = 'components/company/confirm-user-company-move';

  // Sort by length descending to match longest path (files) before directories
  const sortedKeys = Object.keys(fullMap).sort((a,b) => b.length - a.length);

  for (const oldPath of sortedKeys) {
    const newPath = fullMap[oldPath];
    let importOld = oldPath.replace(/\.tsx?$/, '');
    let importNew = newPath.replace(/\.tsx?$/, '');
    
    repls.push([`@/${importOld}'`, `@/${importNew}'`]);
    repls.push([`@/${importOld}"`, `@/${importNew}"`]);
    
    // For when directory imports act as index: `@/components/CompanyDetail`
    repls.push([`@/${importOld}/`, `@/${importNew}/`]);
  }
  
  return repls;
}

const replacements = generateReplacements();

function applyReplacements() {
  console.log("Phase 2: Applying alias replacements across all files...");
  function walk(dir) {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      if (file === 'node_modules' || file === '.next' || file === '.git') continue;
      const full = path.join(dir, file);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
      } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
        let content = fs.readFileSync(full, 'utf8');
        let changed = false;
        
        for (const [oldStr, newStr] of replacements) {
          if (content.includes(oldStr)) {
            content = content.replaceAll(oldStr, newStr);
            changed = true;
          }
        }
        
        if (changed) {
          fs.writeFileSync(full, content, 'utf8');
          console.log(`Updated alias imports in ${full}`);
        }
      }
    }
  }
  walk(SRC_DIR);
}

function moveFiles() {
  console.log("Phase 3: Moving files and directories...");
  
  // Remove that code workspace file first
  const workspaceFile = path.join(SRC_DIR, 'components/Tickets/FD Ticket.code-workspace');
  if (fs.existsSync(workspaceFile)) fs.unlinkSync(workspaceFile);

  // Move files
  for (const [oldPath, newPath] of Object.entries(MOVE_MAP)) {
    const src = path.join(SRC_DIR, oldPath);
    const dest = path.join(SRC_DIR, newPath);
    if (fs.existsSync(src)) {
      ensureDir(dest);
      fs.renameSync(src, dest);
      console.log(`Moved ${oldPath} -> ${newPath}`);
    }
  }

  // Move directories
  for (const [oldDir, newDir] of Object.entries(DIRS_MAP)) {
    const src = path.join(SRC_DIR, oldDir);
    const dest = path.join(SRC_DIR, newDir);
    if (fs.existsSync(src)) {
      ensureDir(dest);
      if (fs.existsSync(dest) && fs.statSync(dest).isDirectory()) {
         const files = fs.readdirSync(src);
         for (const file of files) {
           fs.renameSync(path.join(src, file), path.join(dest, file));
         }
         fs.rmdirSync(src);
      } else {
         fs.renameSync(src, dest);
      }
      console.log(`Moved dir ${oldDir} -> ${newDir}`);
    }
  }

  removeEmptyDirs(path.join(SRC_DIR, 'components'));
}

async function run() {
  normalizeRelativeImports();
  applyReplacements();
  moveFiles();
  console.log("Refactoring complete.");
}

run();
