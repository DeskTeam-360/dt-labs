<?php
/**
 * Plugin Name: DeskTeam360 Monitor
 * Description: Sends WordPress/PHP version, comments, Gravity Forms entry log and Wordfence log to an external endpoint, signed with a secret key (HMAC).
 * Version: 0.2.2
 * Requires PHP: 7.4
 * Author: DeskTeam360
 *
 * Secret key: define in wp-config.php (preferred):
 *     define( 'DT360_MONITOR_KEY', 'your-long-random-secret' );
 *     define( 'DT360_MONITOR_ENDPOINT', 'https://your-app.example.com/api/wp-monitor' ); // optional
 * With DeskTeam360 always use the two lines it shows when the site is added (Company, Websites, Monitor WordPress). A key generated on activation is only a placeholder and DeskTeam360 does not know it.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class DT360_Monitor {
	const OPT_KEY      = 'dt360_monitor_key';
	const OPT_ENDPOINT = 'dt360_monitor_endpoint';
	const OPT_LAST     = 'dt360_monitor_last';
	const CRON_HOOK    = 'dt360_monitor_send';

	public static function init() {
		register_activation_hook( __FILE__, array( __CLASS__, 'activate' ) );
		register_deactivation_hook( __FILE__, array( __CLASS__, 'deactivate' ) );
		add_action( self::CRON_HOOK, array( __CLASS__, 'send' ) );
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_post_dt360_send_now', array( __CLASS__, 'send_now' ) );
		add_action( 'admin_post_dt360_save', array( __CLASS__, 'save' ) );
		add_action( 'rest_api_init', array( __CLASS__, 'register_rest' ) );
	}

	public static function activate() {
		if ( ! get_option( self::OPT_KEY ) ) {
			add_option( self::OPT_KEY, wp_generate_password( 48, false, false ), '', false );
		}
		if ( ! wp_next_scheduled( self::CRON_HOOK ) ) {
			wp_schedule_event( time() + 60, 'hourly', self::CRON_HOOK );
		}
	}

	public static function deactivate() {
		wp_clear_scheduled_hook( self::CRON_HOOK );
	}

	public static function key() {
		return defined( 'DT360_MONITOR_KEY' ) ? (string) DT360_MONITOR_KEY : (string) get_option( self::OPT_KEY, '' );
	}

	public static function endpoint() {
		return defined( 'DT360_MONITOR_ENDPOINT' ) ? (string) DT360_MONITOR_ENDPOINT : (string) get_option( self::OPT_ENDPOINT, '' );
	}

	/* ---------- Data collection ---------- */

	public static function collect() {
		global $wp_version;
		return array(
			'site_url'    => home_url(),
			'site_name'   => get_bloginfo( 'name' ),
			'sent_at'     => gmdate( 'c' ),
			'wp_version'  => $wp_version,
			'php_version' => PHP_VERSION,
			'updates'     => self::updates(),
			'comments'    => self::comments(),
			'gravityforms' => self::gravity_forms(),
			'wordfence'   => self::wordfence(),
			'ssl'         => self::ssl(),
			'users'       => self::users(),
			'backup'      => self::backup(),
		);
	}

	/** SSL certificate of this site: valid/expiry. Cached 6 hours. */
	private static function ssl() {
		$host   = wp_parse_url( home_url(), PHP_URL_HOST );
		$scheme = wp_parse_url( home_url(), PHP_URL_SCHEME );
		if ( 'https' !== $scheme || ! $host ) {
			return array( 'https' => false );
		}
		$cached = get_transient( 'dt360_ssl' );
		if ( is_array( $cached ) && ( $cached['host'] ?? '' ) === $host ) {
			return $cached;
		}
		$out = array( 'https' => true, 'host' => $host, 'checked_at' => gmdate( 'c' ) );
		$ctx = stream_context_create( array( 'ssl' => array( 'capture_peer_cert' => true, 'verify_peer' => false, 'verify_peer_name' => false, 'SNI_enabled' => true, 'peer_name' => $host ) ) );
		$fp  = @stream_socket_client( 'ssl://' . $host . ':443', $errno, $errstr, 8, STREAM_CLIENT_CONNECT, $ctx );
		if ( ! $fp ) {
			$out['error'] = $errstr ?: 'connection failed';
		} else {
			$params = stream_context_get_params( $fp );
			fclose( $fp );
			$cert = ! empty( $params['options']['ssl']['peer_certificate'] ) ? openssl_x509_parse( $params['options']['ssl']['peer_certificate'] ) : null;
			if ( $cert ) {
				$to                = (int) $cert['validTo_time_t'];
				$out['valid_to']   = gmdate( 'c', $to );
				$out['days_left']  = (int) floor( ( $to - time() ) / DAY_IN_SECONDS );
				$out['issuer']     = $cert['issuer']['O'] ?? ( $cert['issuer']['CN'] ?? null );
				$out['subject']    = $cert['subject']['CN'] ?? null;
				$out['expired']    = $to < time();
			} else {
				$out['error'] = 'no certificate';
			}
		}
		set_transient( 'dt360_ssl', $out, 6 * HOUR_IN_SECONDS );
		return $out;
	}

	/** Administrators and failed logins (failed logins come from Wordfence's login log when it is installed). */
	private static function users() {
		global $wpdb;
		$admins = array();
		foreach ( get_users( array( 'role' => 'administrator', 'number' => 100 ) ) as $u ) {
			$admins[] = array(
				'id'         => (int) $u->ID,
				'login'      => $u->user_login,
				'email'      => $u->user_email,
				'registered' => $u->user_registered,
			);
		}
		$out   = array( 'administrators' => $admins, 'failed_logins_24h' => null );
		$table = self::find_table( $wpdb->prefix . 'wfLogins' );
		if ( $table ) {
			$since                      = time() - DAY_IN_SECONDS;
			$out['failed_logins_24h']   = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM `$table` WHERE fail = 1 AND ctime >= %d", $since ) );
			$out['failed_login_users']  = array_map( function ( $r ) {
				return array( 'username' => $r['username'], 'count' => (int) $r['n'] );
			}, (array) $wpdb->get_results( $wpdb->prepare( "SELECT username, COUNT(*) AS n FROM `$table` WHERE fail = 1 AND ctime >= %d GROUP BY username ORDER BY n DESC LIMIT 10", $since ), ARRAY_A ) );
		}
		return $out;
	}

	/** Last backup of UpdraftPlus (reads its stored options; nothing else is touched). */
	private static function backup() {
		if ( ! defined( 'UPDRAFTPLUS_DIR' ) && ! class_exists( 'UpdraftPlus' ) ) {
			return array( 'updraftplus' => false );
		}
		$out  = array( 'updraftplus' => true );
		$last = get_option( 'updraft_last_backup' );
		if ( is_array( $last ) ) {
			$out['last_success']   = isset( $last['success'] ) ? (bool) $last['success'] : null;
			$out['last_time']      = ! empty( $last['backup_time'] ) ? gmdate( 'c', (int) $last['backup_time'] ) : null;
			$out['last_errors']    = ! empty( $last['errors'] ) && is_array( $last['errors'] ) ? array_slice( array_map( function ( $e ) {
				return is_array( $e ) ? ( $e['message'] ?? wp_json_encode( $e ) ) : (string) $e;
			}, $last['errors'] ), 0, 5 ) : array();
		}
		$history = get_option( 'updraft_backup_history' );
		if ( is_array( $history ) && $history ) {
			krsort( $history );
			$out['history_count']      = count( $history );
			$out['latest_in_history']  = gmdate( 'c', (int) array_key_first( $history ) );
		}
		$out['schedule_files'] = get_option( 'updraft_interval', 'manual' );
		$out['schedule_db']    = get_option( 'updraft_interval_database', 'manual' );
		return $out;
	}

	/** Update status from WordPress' own cached update checks (refreshed by WP-Cron twice a day). */
	private static function updates() {
		global $wp_version;
		$core   = get_site_transient( 'update_core' );
		$latest = null;
		if ( $core && ! empty( $core->updates ) ) {
			foreach ( $core->updates as $u ) {
				if ( isset( $u->response ) && 'upgrade' === $u->response ) {
					$latest = $u->current;
					break;
				}
			}
		}
		if ( ! function_exists( 'get_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}
		$installed_plugins = get_plugins();
		$list = function ( $transient, $is_plugin ) use ( $installed_plugins ) {
			$out = array();
			if ( $transient && ! empty( $transient->response ) ) {
				foreach ( (array) $transient->response as $slug => $u ) {
					$name    = null;
					$current = null;
					if ( $is_plugin && isset( $installed_plugins[ $slug ] ) ) {
						$name    = $installed_plugins[ $slug ]['Name'];
						$current = $installed_plugins[ $slug ]['Version'];
					} elseif ( ! $is_plugin ) {
						$theme   = wp_get_theme( $slug );
						$name    = $theme->exists() ? $theme->get( 'Name' ) : null;
						$current = $theme->exists() ? $theme->get( 'Version' ) : null;
					}
					$u     = (object) $u;
					$out[] = array(
						'slug'        => $is_plugin ? ( $u->slug ?? $slug ) : $slug,
						'name'        => $name,
						'version'     => $current,
						'new_version' => $u->new_version ?? null,
					);
				}
			}
			return $out;
		};
		return array(
			'core_update_available' => null !== $latest,
			'core_latest'           => $latest ?: $wp_version,
			'plugins'               => $list( get_site_transient( 'update_plugins' ), true ),
			'themes'                => $list( get_site_transient( 'update_themes' ), false ),
		);
	}

	private static function comments() {
		$counts = wp_count_comments();
		$recent = get_comments( array( 'number' => 20, 'status' => 'all', 'orderby' => 'comment_date_gmt', 'order' => 'DESC' ) );
		$items  = array();
		foreach ( $recent as $c ) {
			$items[] = array(
				'id'      => (int) $c->comment_ID,
				'post_id' => (int) $c->comment_post_ID,
				'author'  => $c->comment_author,
				'status'  => wp_get_comment_status( $c ),
				'date'    => $c->comment_date_gmt,
				'excerpt' => wp_trim_words( wp_strip_all_tags( $c->comment_content ), 20 ),
			);
		}
		return array(
			'approved' => (int) $counts->approved,
			'pending'  => (int) $counts->moderated,
			'spam'     => (int) $counts->spam,
			'trash'    => (int) $counts->trash,
			'recent'   => $items,
		);
	}

	private static function gravity_forms() {
		if ( ! class_exists( 'GFAPI' ) ) {
			return array( 'active' => false );
		}
		$out   = array( 'active' => true, 'version' => class_exists( 'GFForms' ) ? GFForms::$version : null, 'forms' => array() );
		$since = gmdate( 'Y-m-d H:i:s', time() - DAY_IN_SECONDS );
		foreach ( (array) GFAPI::get_forms() as $form ) {
			$fid     = (int) $form['id'];
			$total   = GFAPI::count_entries( $fid, array( 'status' => 'active' ) );
			$last24  = GFAPI::count_entries( $fid, array( 'status' => 'active', 'start_date' => $since ) );
			$spam    = GFAPI::count_entries( $fid, array( 'status' => 'spam' ) );
			$entries = GFAPI::get_entries( $fid, array( 'status' => 'active' ), array( 'key' => 'date_created', 'direction' => 'DESC' ), array( 'offset' => 0, 'page_size' => 10 ) );
			$recent  = array();
			if ( ! is_wp_error( $entries ) ) {
				foreach ( $entries as $e ) {
					// Metadata only; field values are deliberately not sent (privacy).
					$recent[] = array(
						'id'         => (int) $e['id'],
						'created'    => $e['date_created'],
						'source_url' => $e['source_url'],
						'is_read'    => (bool) $e['is_read'],
					);
				}
			}
			$out['forms'][] = array(
				'id' => $fid, 'title' => $form['title'], 'total' => (int) $total,
				'last_24h' => (int) $last24, 'spam' => (int) $spam, 'recent' => $recent,
			);
		}
		return $out;
	}

	/** The real name of a table, found without regard to upper or lower case (some servers store table names in lower case), or null. */
	private static function find_table( $table ) {
		global $wpdb;
		$found = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $wpdb->esc_like( $table ) ) );
		return $found && 0 === strcasecmp( $found, $table ) ? $found : null;
	}

	private static function wordfence() {
		global $wpdb;
		if ( ! defined( 'WORDFENCE_VERSION' ) ) {
			return array( 'active' => false );
		}
		$out = array( 'active' => true, 'version' => WORDFENCE_VERSION );

		$issues = self::find_table( $wpdb->prefix . 'wfIssues' );
		if ( $issues ) {
			$out['open_issues'] = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM `$issues` WHERE status = %s", 'new' ) );
			$rows               = $wpdb->get_results( $wpdb->prepare( "SELECT type, severity, shortMsg, time FROM `$issues` WHERE status = %s ORDER BY severity ASC, time DESC LIMIT 20", 'new' ), ARRAY_A );
			$out['issues']      = array_map( function ( $r ) {
				return array(
					'type' => $r['type'], 'severity' => (int) $r['severity'],
					'message' => $r['shortMsg'], 'time' => gmdate( 'c', (int) $r['time'] ),
				);
			}, (array) $rows );
		}

		$blocked = self::find_table( $wpdb->prefix . 'wfBlockedIPLog' );
		if ( $blocked ) {
			$day                 = (int) floor( time() / 86400 ) - 1;
			$out['blocked_24h']  = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COALESCE(SUM(blockCount),0) FROM `$blocked` WHERE unixday >= %d", $day ) );
		}

		$status = self::find_table( $wpdb->prefix . 'wfStatus' );
		if ( $status ) {
			$rows       = $wpdb->get_results( "SELECT ctime, level, type, msg FROM `$status` WHERE level <= 2 ORDER BY ctime DESC LIMIT 30", ARRAY_A );
			$out['log'] = array_map( function ( $r ) {
				return array(
					'time' => gmdate( 'c', (int) $r['ctime'] ), 'level' => (int) $r['level'],
					'type' => $r['type'], 'message' => wp_strip_all_tags( $r['msg'] ),
				);
			}, (array) $rows );
		}
		return $out;
	}

	/* ---------- On request (DeskTeam360 asks for the report, e.g. when it crawls the site) ---------- */

	public static function register_rest() {
		register_rest_route( 'dt360-monitor/v1', '/report', array(
			'methods'             => 'GET',
			'callback'            => array( __CLASS__, 'rest_report' ),
			'permission_callback' => array( __CLASS__, 'rest_allowed' ),
		) );
	}

	/** The request must carry X-DT360-Timestamp (within 5 minutes) and X-DT360-Signature = HMAC-SHA256(key, timestamp + ".report"). */
	public static function rest_allowed( $request ) {
		$key = self::key();
		$ts  = (string) $request->get_header( 'x-dt360-timestamp' );
		$sig = (string) $request->get_header( 'x-dt360-signature' );
		if ( '' === $key || ! ctype_digit( $ts ) || abs( time() - (int) $ts ) > 300 || '' === $sig ) {
			return false;
		}
		return hash_equals( hash_hmac( 'sha256', $ts . '.report', $key ), $sig );
	}

	public static function rest_report() {
		return rest_ensure_response( self::collect() );
	}

	/* ---------- Sending ---------- */

	public static function send() {
		$endpoint = self::endpoint();
		$key      = self::key();
		if ( ! $endpoint || ! $key ) {
			return array( 'ok' => false, 'message' => 'Endpoint or key is not set.' );
		}
		$body = wp_json_encode( self::collect() );
		$ts   = (string) time();
		$sig  = hash_hmac( 'sha256', $ts . '.' . $body, $key );

		$res = wp_remote_post( $endpoint, array(
			'timeout' => 20,
			'headers' => array(
				'Content-Type'        => 'application/json',
				'X-DT360-Timestamp'   => $ts,
				'X-DT360-Signature'   => $sig,
				'X-DT360-Site'        => home_url(),
			),
			'body'    => $body,
		) );

		if ( is_wp_error( $res ) ) {
			$r = array( 'ok' => false, 'message' => $res->get_error_message() );
		} else {
			$code = (int) wp_remote_retrieve_response_code( $res );
			$r    = array( 'ok' => $code >= 200 && $code < 300, 'message' => 'HTTP ' . $code );
		}
		$r['time'] = gmdate( 'c' );
		update_option( self::OPT_LAST, $r, false );
		return $r;
	}

	/* ---------- Admin ---------- */

	public static function menu() {
		add_management_page( 'DeskTeam360 Monitor', 'DT360 Monitor', 'manage_options', 'dt360-monitor', array( __CLASS__, 'page' ) );
	}

	public static function save() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'Forbidden' );
		}
		check_admin_referer( 'dt360_save' );
		if ( ! defined( 'DT360_MONITOR_ENDPOINT' ) ) {
			update_option( self::OPT_ENDPOINT, esc_url_raw( wp_unslash( $_POST['endpoint'] ?? '' ) ), false );
		}
		if ( ! defined( 'DT360_MONITOR_KEY' ) && ! empty( $_POST['regen'] ) ) {
			update_option( self::OPT_KEY, wp_generate_password( 48, false, false ), false );
		}
		wp_safe_redirect( admin_url( 'tools.php?page=dt360-monitor&saved=1' ) );
		exit;
	}

	public static function send_now() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'Forbidden' );
		}
		check_admin_referer( 'dt360_send_now' );
		self::send();
		wp_safe_redirect( admin_url( 'tools.php?page=dt360-monitor&sent=1' ) );
		exit;
	}

	public static function page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$last      = get_option( self::OPT_LAST );
		$key_const = defined( 'DT360_MONITOR_KEY' );
		$ep_const  = defined( 'DT360_MONITOR_ENDPOINT' );
		?>
		<div class="wrap">
			<h1>DeskTeam360 Monitor</h1>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="dt360_save">
				<?php wp_nonce_field( 'dt360_save' ); ?>
				<table class="form-table">
					<tr><th>Endpoint URL</th><td>
						<input type="url" name="endpoint" class="regular-text" value="<?php echo esc_attr( self::endpoint() ); ?>" <?php disabled( $ep_const ); ?>>
						<?php if ( $ep_const ) echo '<p class="description">Set in wp-config.php.</p>'; ?>
					</td></tr>
					<tr><th>Secret key</th><td>
						<code><?php echo esc_html( self::key() ); ?></code>
						<p class="description"><?php echo $key_const ? 'Set in wp-config.php (DT360_MONITOR_KEY).' : 'Not set in wp-config.php yet. DeskTeam360 gives you the two lines (key and endpoint) when the site is added under Company, Websites; paste them into wp-config.php. A key made here would not match the one DeskTeam360 knows.'; ?></p>
						<?php if ( ! $key_const ) : ?>
							<label><input type="checkbox" name="regen" value="1"> Generate a new key on save</label>
						<?php endif; ?>
					</td></tr>
				</table>
				<?php submit_button( 'Save' ); ?>
			</form>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="dt360_send_now">
				<?php wp_nonce_field( 'dt360_send_now' ); ?>
				<?php submit_button( 'Send now', 'secondary' ); ?>
			</form>
			<p>Last send: <?php echo $last ? esc_html( $last['time'] . ' — ' . ( $last['ok'] ? 'OK' : 'FAILED' ) . ' (' . $last['message'] . ')' ) : 'never'; ?></p>
			<p class="description">Sent hourly via WP-Cron, and DeskTeam360 can also ask for it on request (GET /wp-json/dt360-monitor/v1/report) when it crawls the site. Both are signed with the key: X-DT360-Timestamp and X-DT360-Signature = HMAC-SHA256(key, timestamp + "." + body).</p>
		</div>
		<?php
	}
}

DT360_Monitor::init();
