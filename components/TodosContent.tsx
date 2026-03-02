'use client'

import { Layout, Spin, Empty } from 'antd'
import { User } from '@supabase/supabase-js'
import AdminSidebar from './AdminSidebar'
import TodosHeader from './Todos/TodosHeader'
import TodosCardView from './Todos/TodosCardView'
import TodosListView from './Todos/TodosListView'
import TodosKanbanView from './Todos/TodosKanbanView'
import FilterSidebar from './Todos/FilterSidebar'
import TodoFormModal from './Todos/TodoFormModal'
import { useTodosData } from './Todos/useTodosData'

interface TodosContentProps {
  user: User
}

export default function TodosContent({ user: currentUser }: TodosContentProps) {
  const {
    collapsed,
    setCollapsed,
    loading,
    modalVisible,
    editingTodo,
    form,
    teams,
    users,
    ticketTypes,
    companies,
    allTags,
    allStatuses,
    allStatusColumns,
    filteredTodos,
    filterStatus,
    setFilterStatus,
    filterTypeId,
    setFilterTypeId,
    filterCompanyId,
    setFilterCompanyId,
    filterTagIds,
    setFilterTagIds,
    filterDateRange,
    setFilterDateRange,
    filterSearch,
    setFilterSearch,
    filterSidebarCollapsed,
    setFilterSidebarCollapsed,
    viewMode,
    setViewMode,
    selectedAssignees,
    setSelectedAssignees,
    selectedTagIds,
    setSelectedTagIds,
    ticketAttachmentsFromDb,
    newTicketAttachments,
    setNewTicketAttachments,
    deletedTicketAttachmentIds,
    setDeletedTicketAttachmentIds,
    hasActiveFilters,
    clearFilters,
    handleCreate,
    handleEdit,
    handleDelete,
    handleSubmit,
    handleModalCancel,
    handleDragStart,
    handleDragEnd,
    handleTicketFilesSelected,
    activeId,
    columnsToShow,
    todos,
  } = useTodosData(currentUser.id)

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />

      <Layout style={{ marginLeft: collapsed ? 80 : 250, marginRight: filterSidebarCollapsed ? 48 : 280, transition: 'margin-left 0.2s, margin-right 0.2s' }}>
        <div style={{ padding: 0, minWidth: 0 }}>
          <TodosHeader
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onCreateClick={handleCreate}
            loading={loading}
          />

          {loading ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <Spin size="large" tip="Loading tasks..." />
            </div>
          ) : viewMode === 'card' ? (
            <TodosCardView todos={filteredTodos} onEdit={handleEdit} onDelete={handleDelete} />
          ) : viewMode === 'list' ? (
            <TodosListView
              todos={filteredTodos}
              allStatusColumns={allStatusColumns}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ) : (
            <TodosKanbanView
              todos={filteredTodos}
              columnsToShow={columnsToShow}
              activeId={activeId}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}
        </div>
      </Layout>

      <FilterSidebar
        collapsed={filterSidebarCollapsed}
        onCollapsedChange={setFilterSidebarCollapsed}
        filterStatus={filterStatus}
        onFilterStatusChange={setFilterStatus}
        filterTypeId={filterTypeId}
        onFilterTypeIdChange={setFilterTypeId}
        filterCompanyId={filterCompanyId}
        onFilterCompanyIdChange={setFilterCompanyId}
        filterTagIds={filterTagIds}
        onFilterTagIdsChange={setFilterTagIds}
        filterDateRange={filterDateRange}
        onFilterDateRangeChange={setFilterDateRange}
        filterSearch={filterSearch}
        onFilterSearchChange={setFilterSearch}
        allStatuses={allStatuses}
        ticketTypes={ticketTypes}
        companies={companies}
        allTags={allTags}
        hasActiveFilters={hasActiveFilters}
        filteredCount={filteredTodos.length}
        totalCount={todos.length}
        onClearFilters={clearFilters}
      />

      <TodoFormModal
        open={modalVisible}
        editingTodo={editingTodo}
        form={form}
        teams={teams}
        users={users}
        ticketTypes={ticketTypes}
        companies={companies}
        allTags={allTags}
        allStatuses={allStatuses}
        selectedAssignees={selectedAssignees}
        onSelectedAssigneesChange={setSelectedAssignees}
        selectedTagIds={selectedTagIds}
        onSelectedTagIdsChange={setSelectedTagIds}
        ticketAttachmentsFromDb={ticketAttachmentsFromDb}
        newTicketAttachments={newTicketAttachments}
        deletedTicketAttachmentIds={deletedTicketAttachmentIds}
        onDeletedAttachmentIdsChange={setDeletedTicketAttachmentIds}
        onNewAttachmentsChange={setNewTicketAttachments}
        onFilesSelected={handleTicketFilesSelected}
        onSubmit={handleSubmit}
        onCancel={handleModalCancel}
      />
    </Layout>
  )
}
