'use client'

import { CopyOutlined, DownloadOutlined } from '@ant-design/icons'
import { Alert, Button, Modal, Space, Typography } from 'antd'
import { message } from 'antd'

const { Text, Paragraph } = Typography

/** Shown once after a site is registered or its key changed: the two lines for wp-config.php, and the plugin to install. */
export default function WpKeySetupModal({ open, onClose, siteLabel, secretKey, rotated }: { open: boolean; onClose: () => void; siteLabel: string; secretKey: string; rotated?: boolean }) {
  const endpoint = typeof window === 'undefined' ? '' : `${window.location.origin}/api/wp-monitor`
  const snippet = `define( 'DT360_MONITOR_KEY', '${secretKey}' );\ndefine( 'DT360_MONITOR_ENDPOINT', '${endpoint}' );`

  return (
    <Modal open={open} onCancel={onClose} title={`${rotated ? 'New key for' : 'Connect'} ${siteLabel}`} width={640} footer={<Button type="primary" onClick={onClose}>Done</Button>} destroyOnHidden>
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <Alert type="warning" showIcon title="This key is shown only now. Copy it before closing; if you lose it, make a new key." />
        {!rotated ? (
          <div>
            <Text strong>1. Install the plugin</Text>
            <Paragraph type="secondary" style={{ margin: '4px 0 8px' }}>
              In the site&apos;s WordPress admin: Plugins, Add New, Upload Plugin, choose the file, then Activate. Skip this if the plugin is already installed.
            </Paragraph>
            <Button icon={<DownloadOutlined />} href="/api/wp-monitor/plugin">Download plugin (zip)</Button>
          </div>
        ) : null}
        <div>
          <Text strong>{rotated ? 'Replace the two lines in wp-config.php' : '2. Add these two lines to wp-config.php'}</Text>
          <Paragraph type="secondary" style={{ margin: '4px 0 8px' }}>Put them above the line that says &ldquo;That&apos;s all, stop editing!&rdquo;. The site reports within the hour.</Paragraph>
          <pre style={{ background: 'var(--ant-color-fill-quaternary, #f5f5f5)', padding: 12, borderRadius: 6, overflowX: 'auto', fontSize: 12, margin: 0 }}>{snippet}</pre>
          <Button style={{ marginTop: 8 }} icon={<CopyOutlined />} onClick={() => void navigator.clipboard.writeText(snippet).then(() => message.success('Copied'))}>Copy the two lines</Button>
        </div>
      </Space>
    </Modal>
  )
}
