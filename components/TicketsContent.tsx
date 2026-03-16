'use client'

import { Layout, Spin, Empty } from 'antd'
import AdminSidebar from './AdminSidebar'
import TicketsHeader from './Tickets/TicketsHeader'
import TicketsCardView from './Tickets/TicketsCardView'
import TicketsListView from './Tickets/TicketsListView'
import TicketsKanbanView from './Tickets/TicketsKanbanView'
import TicketsRoundRobinView from './Tickets/TicketsRoundRobinView'
import FilterSidebar from './Tickets/FilterSidebar'
import TicketFormModal from './Tickets/TicketFormModal'
import { useTicketsData } from './Tickets/useTicketsData'

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
    handleTicketFilesSelected,
    handleRemoveNewAttachment,
    attachmentUploading,
    hasActiveFilters,
    clearFilters,
    handleCreate,
    handleEdit,
    handleDelete,
    handleSubmit,
    handleModalCancel,
    handleDragStart,
    handleDragEnd,
    activeId,
    columnsToShow,
    tickets,
  } = useTicketsData(currentUser.id, isCustomer)

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />

      <Layout
        style={{
          marginLeft: collapsed ? 80 : 250,
          marginRight: filterSidebarCollapsed ? 48 : 280,
          transition: 'margin-left 0.2s, margin-right 0.2s',
          borderRadius: '16px 0 0 16px',
          overflow: 'hidden',
          background: '#f0f2f5',
          minHeight: '100vh',
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

          {loading ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <Spin size="large" tip="Loading tasks..." />
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
            />
          ) : viewMode === 'list' ? (
            <TicketsListView
              tickets={filteredTickets}
              allStatusColumns={allStatusColumns}
              allPriorities={ticketPriorities}
              onEdit={handleEdit}
              onDelete={handleDelete}
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
            />
          )}
        </div>
      </Layout>

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
      />

      <TicketFormModal
        open={modalVisible}
        editingTicket={editingTicket}
        form={form}
        teams={teams}
        users={users}
        ticketTypes={ticketTypes}
        ticketPriorities={ticketPriorities}
        companies={companies}
        allTags={allTags}
        allStatuses={allStatuses}
        selectedAssignees={selectedAssignees}
        onSelectedAssigneesChange={setSelectedAssignees}
        selectedTagIds={selectedTagIds}
        onSelectedTagIdsChange={setSelectedTagIds}
        ticketAttachmentsFromDb={[]}
        newTicketAttachments={newTicketAttachments}
        deletedTicketAttachmentIds={[]}
        onDeletedAttachmentIdsChange={() => {}}
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
