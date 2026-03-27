'use client'

import { Modal } from 'antd'

/** Peringatan saat user customer sudah punya company lalu dialihkan ke company lain (bukan di /companies saja). */
export function confirmUserCompanyMove(options: {
  userLabel: string
  fromCompanyName: string
  toCompanyName: string
  onOk: () => void | Promise<void>
}): void {
  Modal.confirm({
    title: 'Pindah company?',
    content: `${options.userLabel} saat ini terdaftar di company "${options.fromCompanyName}". Jika dilanjutkan, user akan dipindahkan ke "${options.toCompanyName}" dan tidak lagi tergabung di company sebelumnya.`,
    okText: 'Ya, pindahkan',
    cancelText: 'Batal',
    onOk: () => Promise.resolve(options.onOk()),
  })
}
