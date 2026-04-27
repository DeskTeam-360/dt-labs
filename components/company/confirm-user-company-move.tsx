'use client'

import { Modal } from 'antd'

/** Confirm when a customer user already belongs to a company and will be moved to another. */
export function confirmUserCompanyMove(options: {
  userLabel: string
  fromCompanyName: string
  toCompanyName: string
  onOk: () => void | Promise<void>
}): void {
  Modal.confirm({
    title: 'Move to another company?',
    content: `${options.userLabel} is currently assigned to "${options.fromCompanyName}". If you continue, they will be moved to "${options.toCompanyName}" and will no longer belong to the previous company.`,
    okText: 'Yes, move user',
    cancelText: 'Cancel',
    onOk: () => Promise.resolve(options.onOk()),
  })
}
