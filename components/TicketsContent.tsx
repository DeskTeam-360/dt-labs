'use client'

import { Layout, Spin, Empty, Alert } from 'antd'
import AdminSidebar from './AdminSidebar'
import TicketsHeader from './Tickets/TicketsHeader'
import TicketsCardView from './Tickets/TicketsCardView'
import TicketsListView from './Tickets/TicketsListView'
import TicketsKanbanView from './Tickets/TicketsKanbanView'
import TicketsRoundRobinView from './Tickets/TicketsRoundRobinView'
import FilterSidebar from './Tickets/FilterSidebar'
import TicketFormModal from './Tickets/TicketFormModal'
import { useTicketsData } from './Tickets/useTicketsData'
import AdminMainColumn from './AdminMainColumn'
import { addSavedTicketFilterPreset } from '@/lib/ticket-saved-filters'

interface TicketsContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
}

export default function TicketsContent({ user: currentUser }: TicketsContentProps) {
  const isCustomer = ((currentUser as { role?: string }).role ?? '').toLowerCase() === 'customer'
  const {
    collapsed,
    setCollapsed,
    loading,
    modalVisible,
    editingTicket,
    form,
    teams,
    users,
    ticketTypes,
    ticketPriorities,
    companies,
    allTags,
    allStatuses,
    allStatusColumns,
    filteredTickets,
    filterStatus,
    setFilterStatus,
    filterTypeIds,
    setFilterTypeIds,
    filterCompanyIds,
    setFilterCompanyIds,
    filterTagIds,
    setFilterTagIds,
    filterVisibility,
    setFilterVisibility,
    filterTeamIds,
    setFilterTeamIds,
    filterDateRange,
    setFilterDateRange,
    filterSearch,
    setFilterSearch,
    filterSidebarCollapsed,
    setFilterSidebarCollapsed,
    viewMode,
    setViewMode,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    selectedAssignees,
    setSelectedAssignees,
    selectedTagIds,
    setSelectedTagIds,
    newTicketAttachments,
    setNewTicketAttachments,
    deletedTicketAttachmentIds,
    setDeletedTicketAttachmentIds,
    handleTicketFilesSelected,
    handleRemoveNewAttachment,
    attachmentUploading,
    hasActiveFilters,
    clearFilters,
    handleCreate,
    handleEdit,
    handleDelete,
    handleBulkMoveToTrash,
    handleBulkMoveToSpam,
    handleBulkDelete,
    handleSubmit,
    handleModalCancel,
    handleDragStart,
    handleDragEnd,
    activeId,
    columnsToShow,
    tickets,
    userTeamIds,
    lookupReady,
    getFilterQueryString,
    filterTicketType,
    filterPriorityIds,
    setFilterPriorityIds,
    filterByStatusFromChip,
    filterByPriorityFromChip,
    filterByTagFromChip,
    filterByCompanyFromChip,
  } = useTicketsData(currentUser.id, isCustomer)

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />

      <AdminMainColumn
        collapsed={collapsed}
        user={currentUser}
        style={{
          marginRight: filterSidebarCollapsed ? 75 : 280,
          transition: 'margin-left 0.2s, margin-right 0.2s',
          borderRadius: '16px 0 0 16px',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: 0, minWidth: 0 }}>
          <TicketsHeader
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onCreateClick={handleCreate}
            loading={loading}
            isCustomer={isCustomer}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortByChange={setSortBy}
            onSortOrderChange={setSortOrder}
            filterSearch={filterSearch}
            onFilterSearchChange={setFilterSearch}
          />

          {!isCustomer && filterTicketType === 'spam' && (
            <Alert
              type="warning"
              showIcon
              message="Spam tickets"
              description="Tickets marked as spam (card view). Use the sidebar to open All tickets or Trash."
              style={{ marginLeft: '24px', marginRight: '48px', marginBottom: '12px' }}
            />
          )}
          {!isCustomer && filterTicketType === 'trash' && (
            <Alert
              type="info"
              showIcon
              message="Trash tickets"
              description="Tickets moved to trash (card view). Use the sidebar to open All tickets or Spam."
              style={{ marginLeft: '24px', marginRight: '48px', marginBottom: '12px' }}
            />
          )}

          {loading || !lookupReady ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
          <Spin size="large" />
          <div style={{ marginTop: 12 }}>Loading tasks...</div>
        </div>
          ) : viewMode === 'card' ? (
            <TicketsCardView
              tickets={filteredTickets}
              allStatusColumns={allStatusColumns}
              onEdit={handleEdit}
              onDelete={handleDelete}
              sortBy={sortBy}
              sortOrder={sortOrder}
              allPriorities={ticketPriorities}
              onFilterByStatus={filterByStatusFromChip}
              onFilterByPriority={filterByPriorityFromChip}
              onFilterByTag={filterByTagFromChip}
              onFilterByCompany={filterByCompanyFromChip}
            />
          ) : viewMode === 'list' ? (
            <TicketsListView
              tickets={filteredTickets}
              allStatusColumns={allStatusColumns}
              allPriorities={ticketPriorities}
              isCustomer={isCustomer}
              filterTicketType={filterTicketType}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onBulkMoveToSpam={!isCustomer ? handleBulkMoveToSpam : undefined}
              onBulkMoveToTrash={!isCustomer ? handleBulkMoveToTrash : undefined}
              onBulkDelete={!isCustomer ? handleBulkDelete : undefined}
              onFilterByStatus={filterByStatusFromChip}
              onFilterByPriority={filterByPriorityFromChip}
              onFilterByTag={filterByTagFromChip}
              onFilterByCompany={filterByCompanyFromChip}
            />
          ) : viewMode === 'roundrobin' && !isCustomer ? (
            <TicketsRoundRobinView
              tickets={filteredTickets}
              statusColumns={allStatusColumns}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ) : (
            <TicketsKanbanView
              tickets={filteredTickets}
              columnsToShow={columnsToShow}
              activeId={activeId}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onEdit={handleEdit}
              onDelete={handleDelete}
              sortBy={sortBy}
              sortOrder={sortOrder}
              allPriorities={ticketPriorities}
              allStatusColumns={allStatusColumns}
              onFilterByStatus={filterByStatusFromChip}
              onFilterByPriority={filterByPriorityFromChip}
              onFilterByTag={filterByTagFromChip}
              onFilterByCompany={filterByCompanyFromChip}
            />
          )}
        </div>
      </AdminMainColumn>

      <FilterSidebar
        collapsed={filterSidebarCollapsed}
        onCollapsedChange={setFilterSidebarCollapsed}
        filterStatus={filterStatus}
        onFilterStatusChange={setFilterStatus}
        filterTypeIds={filterTypeIds}
        onFilterTypeIdsChange={setFilterTypeIds}
        filterCompanyIds={filterCompanyIds}
        onFilterCompanyIdsChange={setFilterCompanyIds}
        filterTagIds={filterTagIds}
        onFilterTagIdsChange={setFilterTagIds}
        filterPriorityIds={filterPriorityIds}
        onFilterPriorityIdsChange={setFilterPriorityIds}
        ticketPriorities={ticketPriorities}
        filterVisibility={filterVisibility}
        onFilterVisibilityChange={setFilterVisibility}
        filterTeamIds={filterTeamIds}
        onFilterTeamIdsChange={setFilterTeamIds}
        filterDateRange={filterDateRange}
        onFilterDateRangeChange={setFilterDateRange}
        filterSearch={filterSearch}
        onFilterSearchChange={setFilterSearch}
        allStatuses={allStatuses}
        ticketTypes={ticketTypes}
        teams={teams}
        companies={companies}
        allTags={allTags}
        hasActiveFilters={hasActiveFilters}
        filteredCount={filteredTickets.length}
        totalCount={filteredTickets.length}
        onClearFilters={clearFilters}
        isCustomer={isCustomer}
        onSaveViewPreset={
          !isCustomer
            ? (name) => addSavedTicketFilterPreset(currentUser.id, name, getFilterQueryString())
            : undefined
        }
      />

      <TicketFormModal
        open={modalVisible}
        editingTicket={editingTicket}
        form={form}
        teams={teams}
        users={users}
        currentUserId={currentUser.id}
        userTeamIds={userTeamIds}
        ticketTypes={ticketTypes}
        ticketPriorities={ticketPriorities}
        companies={companies}
        allTags={allTags}
        allStatuses={allStatuses}
        selectedAssignees={selectedAssignees}
        onSelectedAssigneesChange={setSelectedAssignees}
        selectedTagIds={selectedTagIds}
        onSelectedTagIdsChange={setSelectedTagIds}
        ticketAttachmentsFromDb={editingTicket?.attachments ?? []}
        newTicketAttachments={newTicketAttachments}
        deletedTicketAttachmentIds={deletedTicketAttachmentIds}
        onDeletedAttachmentIdsChange={setDeletedTicketAttachmentIds}
        onNewAttachmentsChange={setNewTicketAttachments}
        onFilesSelected={handleTicketFilesSelected}
        onRemoveNewAttachment={handleRemoveNewAttachment}
        attachmentUploading={attachmentUploading}
        onSubmit={handleSubmit}
        onCancel={handleModalCancel}
        isCustomer={isCustomer}
      />
    </Layout>
  )
}
