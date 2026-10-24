<?php
declare(strict_types=1);

$config = require __DIR__ . '/../config/config.php';

session_set_cookie_params([
    'httponly' => true,
    'samesite' => 'Lax',
    'secure'   => !empty($_SERVER['HTTPS']),
]);
session_start();

function config(): array
{
    global $config;
    return $config;
}

/** Connexion PDO unique (requêtes préparées partout → pas d'injection SQL). */
function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $c = config()['db'];
        $dsn = "mysql:host={$c['host']};dbname={$c['name']};charset={$c['charset']}";
        $pdo = new PDO($dsn, $c['user'], $c['pass'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
    return $pdo;
}

function json_out(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $message, int $status = 400): never
{
    json_out(['ok' => false, 'error' => $message], $status);
}

function input(): array
{
    static $data = null;
    if ($data === null) {
        $raw  = file_get_contents('php://input');
        $json = $raw ? json_decode($raw, true) : null;
        $data = is_array($json) ? $json : $_POST;
    }
    return $data;
}

/** Jeton CSRF : envoyé en en-tête X-CSRF-Token par le JavaScript. */
function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function check_csrf(): void
{
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!hash_equals($_SESSION['csrf'] ?? '', $sent)) {
        fail('Session expirée, recharge la page.', 419);
    }
}

function require_login(): array
{
    if (empty($_SESSION['player_id'])) {
        fail('Connecte-toi pour jouer.', 401);
    }
    $playerId = (int)$_SESSION['player_id'];
    grant_arrival_bonus($playerId);
    $st = db()->prepare('SELECT * FROM players WHERE id = ?');
    $st->execute([$playerId]);
    $p = $st->fetch();
    if (!$p) {
        session_destroy();
        fail('Compte introuvable.', 401);
    }
    return $p;
}

function grant_arrival_bonus(int $playerId): void
{
    $pdo = db();
    $check = $pdo->prepare('SELECT 1 FROM player_arrival_bonuses WHERE player_id = ?');
    $check->execute([$playerId]);
    if ($check->fetchColumn()) {
        return;
    }

    $pdo->beginTransaction();
    try {
        $lock = $pdo->prepare('SELECT id FROM players WHERE id = ? FOR UPDATE');
        $lock->execute([$playerId]);
        if (!$lock->fetchColumn()) {
            $pdo->rollBack();
            return;
        }

        $insert = $pdo->prepare('INSERT IGNORE INTO player_arrival_bonuses (player_id) VALUES (?)');
        $insert->execute([$playerId]);
        if ($insert->rowCount() === 1) {
            $bonus = (int)config()['game']['arrival_bonus'];
            $pdo->prepare('UPDATE players SET cash = cash + ? WHERE id = ?')
                ->execute([$bonus, $playerId]);
            log_tx($playerId, 'bonus_arrivee', $bonus, 'Bonus de première arrivée en ville');
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

function public_player(array $p): array
{
    unset($p['password_hash'], $p['email']);
    return $p;
}

function log_tx(int $playerId, string $kind, int $amount, string $label): void
{
    db()->prepare('INSERT INTO transactions (player_id, kind, amount, label) VALUES (?,?,?,?)')
        ->execute([$playerId, $kind, $amount, $label]);
}

function add_xp(int $playerId, int $xp): void
{
    $step = config()['game']['level_xp_step'];
    db()->prepare('UPDATE players SET xp = xp + ?, level = 1 + FLOOR((xp + ?) / ?) WHERE id = ?')
        ->execute([$xp, $xp, $step, $playerId]);
}

function room_size(int $rooms): array
{
    return ['w' => min(6 + $rooms * 2, 18), 'd' => min(5 + $rooms * 1.5, 14)];
}

function clamp_pose(array $room, array $in): array
{
    $pose = [];
    foreach (['x', 'z', 'rot'] as $key) {
        $value = $in[$key] ?? 0;
        if (!is_numeric($value) || !is_finite((float)$value)) {
            fail('Position de meuble invalide.');
        }
        $pose[$key] = (float)$value;
    }
    $x = max(-$room['w'] / 2 + 0.3, min($room['w'] / 2 - 0.3, $pose['x']));
    $z = max(-$room['d'] / 2 + 0.3, min($room['d'] / 2 - 0.3, $pose['z']));
    $rot = fmod($pose['rot'], 2 * M_PI);
    return [round($x, 2), round($z, 2), round($rot, 3)];
}

function furniture_inventory(int $playerId): array
{
    $st = db()->prepare('SELECT f.id, f.name, f.category, f.slug, f.model_file,
                                CAST(pf.quantity AS SIGNED) - COALESCE(pc.n, 0) AS left_qty
                         FROM player_furniture pf
                         JOIN furniture f ON f.id = pf.furniture_id
                         LEFT JOIN (SELECT furniture_id, COUNT(*) AS n FROM placed_furniture
                                    WHERE player_id = ? GROUP BY furniture_id) pc ON pc.furniture_id = pf.furniture_id
                         WHERE pf.player_id = ? ORDER BY f.category, f.name');
    $st->execute([$playerId, $playerId]);
    return array_values(array_filter($st->fetchAll(), static fn($item) => (int)$item['left_qty'] > 0));
}
