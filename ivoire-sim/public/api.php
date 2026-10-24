<?php
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// Toute action qui modifie des données doit être en POST + jeton CSRF
$readOnly = ['csrf', 'me', 'cities', 'properties', 'vehicles', 'jobs', 'transactions', 'garage', 'my_properties', 'online', 'furniture', 'my_furniture', 'house'];
if (!in_array($action, $readOnly, true)) {
    if ($method !== 'POST') {
        fail('Méthode non autorisée.', 405);
    }
    if ($action !== 'login' && $action !== 'register') {
        check_csrf();
    }
}

try {
    switch ($action) {

        case 'csrf':
            json_out(['ok' => true, 'csrf' => csrf_token(), 'logged' => !empty($_SESSION['player_id'])]);

        // ---------- Compte ----------
        case 'register': {
            $in = input();
            $username = trim((string)($in['username'] ?? ''));
            $email    = trim((string)($in['email'] ?? ''));
            $password = (string)($in['password'] ?? '');

            if (!preg_match('/^[A-Za-z0-9_]{3,30}$/', $username)) {
                fail('Pseudo : 3 à 30 caractères (lettres, chiffres, _).');
            }
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                fail('Email invalide.');
            }
            if (strlen($password) < 8) {
                fail('Mot de passe : 8 caractères minimum.');
            }
            $st = db()->prepare('SELECT id FROM players WHERE username = ? OR email = ?');
            $st->execute([$username, $email]);
            if ($st->fetch()) {
                fail('Pseudo ou email déjà utilisé.', 409);
            }
            $cash = config()['game']['start_cash'];
            db()->prepare('INSERT INTO players (username, email, password_hash, cash) VALUES (?,?,?,?)')
                ->execute([$username, $email, password_hash($password, PASSWORD_DEFAULT), $cash]);
            $id = (int)db()->lastInsertId();
            session_regenerate_id(true);
            $_SESSION['player_id'] = $id;
            json_out(['ok' => true, 'csrf' => csrf_token()]);
        }

        case 'login': {
            $in = input();
            $login = trim((string)($in['login'] ?? ''));
            $pass  = (string)($in['password'] ?? '');
            $st = db()->prepare('SELECT * FROM players WHERE username = ? OR email = ?');
            $st->execute([$login, $login]);
            $p = $st->fetch();
            if (!$p || !password_verify($pass, $p['password_hash'])) {
                fail('Identifiants incorrects.', 401);
            }
            session_regenerate_id(true);
            $_SESSION['player_id'] = (int)$p['id'];
            db()->prepare('UPDATE players SET last_login_at = NOW() WHERE id = ?')->execute([$p['id']]);
            json_out(['ok' => true, 'csrf' => csrf_token()]);
        }

        case 'logout':
            $_SESSION = [];
            session_destroy();
            json_out(['ok' => true]);

        case 'me': {
            $p = require_login();
            $job = db()->prepare('SELECT j.* FROM player_jobs pj JOIN jobs j ON j.id = pj.job_id WHERE pj.player_id = ?');
            $job->execute([$p['id']]);
            $city = null;
            if ($p['city_id']) {
                $c = db()->prepare('SELECT * FROM cities WHERE id = ?');
                $c->execute([$p['city_id']]);
                $city = $c->fetch() ?: null;
            }
            json_out(['ok' => true, 'player' => public_player($p), 'job' => $job->fetch() ?: null, 'city' => $city]);
        }

        case 'set_character': {
            $p = require_login();
            $model = (string)(input()['model'] ?? '');
            $allowedModels = ['Female_Casual', 'Female_Dress', 'Male_Casual', 'Male_Suit', 'Cozy_Animated', 'Cozy_Chef', 'Cozy_Space'];
            if (!in_array($model, $allowedModels, true)) {
                fail('Personnage invalide.');
            }
            db()->prepare('UPDATE players SET character_model = ? WHERE id = ?')
                ->execute([$model, $p['id']]);
            json_out(['ok' => true, 'character_model' => $model]);
        }

        // ---------- Villes ----------
        case 'cities':
            json_out(['ok' => true, 'cities' => db()->query('SELECT * FROM cities ORDER BY id')->fetchAll()]);

        case 'choose_city': {
            $p = require_login();
            $cityId = (int)(input()['city_id'] ?? 0);
            $st = db()->prepare('SELECT id FROM cities WHERE id = ?');
            $st->execute([$cityId]);
            if (!$st->fetch()) {
                fail('Ville inconnue.');
            }
            db()->prepare('UPDATE players SET city_id = ? WHERE id = ?')->execute([$cityId, $p['id']]);
            json_out(['ok' => true]);
        }

        // ---------- Propriétés ----------
        case 'properties': {
            require_login();
            $sql = 'SELECT pr.*, c.name AS city_name,
                           (pp.id IS NOT NULL) AS sold
                    FROM properties pr
                    JOIN cities c ON c.id = pr.city_id
                    LEFT JOIN player_properties pp ON pp.property_id = pr.id
                    ORDER BY pr.price';
            json_out(['ok' => true, 'properties' => db()->query($sql)->fetchAll()]);
        }

        case 'buy_property': {
            $p = require_login();
            $propId = (int)(input()['property_id'] ?? 0);
            $pdo = db();
            $pdo->beginTransaction();
            try {
                // verrou sur le joueur pour éviter les doubles achats simultanés
                $st = $pdo->prepare('SELECT cash FROM players WHERE id = ? FOR UPDATE');
                $st->execute([$p['id']]);
                $cash = (int)$st->fetchColumn();

                $st = $pdo->prepare('SELECT * FROM properties WHERE id = ?');
                $st->execute([$propId]);
                $prop = $st->fetch();
                if (!$prop) {
                    throw new RuntimeException('Propriété introuvable.');
                }
                if ($cash < (int)$prop['price']) {
                    throw new RuntimeException('Pas assez d\'argent liquide.');
                }
                $pdo->prepare('INSERT INTO player_properties (player_id, property_id) VALUES (?,?)')
                    ->execute([$p['id'], $propId]);   // échoue si déjà vendue (clé unique)
                $pdo->prepare('UPDATE players SET cash = cash - ? WHERE id = ?')->execute([$prop['price'], $p['id']]);
                log_tx((int)$p['id'], 'achat', -(int)$prop['price'], 'Achat : ' . $prop['name']);
                $pdo->commit();
            } catch (PDOException $e) {
                $pdo->rollBack();
                fail($e->getCode() === '23000' ? 'Cette propriété est déjà vendue.' : 'Erreur serveur.', 409);
            } catch (RuntimeException $e) {
                $pdo->rollBack();
                fail($e->getMessage());
            }
            json_out(['ok' => true]);
        }

        case 'my_properties': {
            $p = require_login();
            $st = db()->prepare('SELECT pr.*, c.name AS city_name FROM player_properties pp
                                 JOIN properties pr ON pr.id = pp.property_id
                                 JOIN cities c ON c.id = pr.city_id
                                 WHERE pp.player_id = ?');
            $st->execute([$p['id']]);
            json_out(['ok' => true, 'properties' => $st->fetchAll()]);
        }

        // ---------- Boutique et inventaire de meubles ----------
        case 'furniture': {
            $p = require_login();
            $st = db()->prepare('SELECT f.id, f.slug, f.name, f.category, f.price, f.model_file,
                                        COALESCE(pf.quantity, 0) AS owned
                                 FROM furniture f
                                 LEFT JOIN player_furniture pf ON pf.furniture_id = f.id AND pf.player_id = ?
                                 ORDER BY f.category, f.price, f.id');
            $st->execute([$p['id']]);
            json_out(['ok' => true, 'furniture' => $st->fetchAll()]);
        }

        case 'buy_furniture': {
            $p = require_login();
            $in = input();
            $furnitureId = (int)($in['furniture_id'] ?? 0);
            $quantity = (int)($in['quantity'] ?? 1);
            if ($quantity < 1 || $quantity > 20) {
                fail('Quantité : 1 à 20.');
            }

            $pdo = db();
            $pdo->beginTransaction();
            try {
                $lock = $pdo->prepare('SELECT cash FROM players WHERE id = ? FOR UPDATE');
                $lock->execute([$p['id']]);
                $cash = (int)$lock->fetchColumn();
                $st = $pdo->prepare('SELECT id, name, price FROM furniture WHERE id = ?');
                $st->execute([$furnitureId]);
                $furniture = $st->fetch();
                if (!$furniture) {
                    throw new RuntimeException('Meuble introuvable.');
                }

                $total = (int)$furniture['price'] * $quantity;
                if ($cash < $total) {
                    throw new RuntimeException('Pas assez d\'argent liquide.');
                }
                $pdo->prepare('UPDATE players SET cash = cash - ? WHERE id = ?')
                    ->execute([$total, $p['id']]);
                $pdo->prepare('INSERT INTO player_furniture (player_id, furniture_id, quantity) VALUES (?,?,?)
                               ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)')
                    ->execute([$p['id'], $furnitureId, $quantity]);
                log_tx((int)$p['id'], 'achat', -$total, 'Achat : ' . $furniture['name'] . ($quantity > 1 ? " x{$quantity}" : ''));
                $pdo->commit();
            } catch (RuntimeException $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                fail($e->getMessage());
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $e;
            }
            json_out(['ok' => true, 'spent' => $total]);
        }

        case 'my_furniture': {
            $p = require_login();
            $st = db()->prepare('SELECT f.id, f.name, f.category, f.model_file, pf.quantity
                                 FROM player_furniture pf
                                 JOIN furniture f ON f.id = pf.furniture_id
                                 WHERE pf.player_id = ? ORDER BY f.category, f.name');
            $st->execute([$p['id']]);
            json_out(['ok' => true, 'furniture' => $st->fetchAll()]);
        }

        // ---------- Aménagement des propriétés ----------
        case 'house': {
            $p = require_login();
            $st = db()->prepare('SELECT pr.id, pr.name, pr.type, pr.rooms, c.name AS city_name
                                 FROM player_properties pp
                                 JOIN properties pr ON pr.id = pp.property_id
                                 JOIN cities c ON c.id = pr.city_id
                                 WHERE pp.player_id = ? ORDER BY pp.id');
            $st->execute([$p['id']]);
            $properties = $st->fetchAll();
            if (!$properties) {
                json_out(['ok' => true, 'properties' => [], 'current' => null]);
            }

            $requestedId = (int)($_GET['property_id'] ?? 0);
            $current = $properties[0];
            if ($requestedId > 0) {
                $matching = array_filter($properties, static fn($property) => (int)$property['id'] === $requestedId);
                if (!$matching) {
                    fail('Propriété introuvable.', 404);
                }
                $current = array_values($matching)[0];
            }

            $placed = db()->prepare('SELECT pl.id, pl.x, pl.z, pl.rot, f.id AS furniture_id,
                                            f.name, f.slug, f.model_file
                                     FROM placed_furniture pl
                                     JOIN furniture f ON f.id = pl.furniture_id
                                     WHERE pl.property_id = ? AND pl.player_id = ? ORDER BY pl.id');
            $placed->execute([$current['id'], $p['id']]);
            json_out(['ok' => true, 'properties' => $properties, 'current' => [
                'property' => $current,
                'room' => room_size((int)$current['rooms']),
                'placed' => $placed->fetchAll(),
                'inventory' => furniture_inventory((int)$p['id']),
            ]]);
        }

        case 'place_furniture': {
            $p = require_login();
            $in = input();
            $propertyId = (int)($in['property_id'] ?? 0);
            $furnitureId = (int)($in['furniture_id'] ?? 0);
            $pdo = db();
            $pdo->beginTransaction();
            try {
                $lock = $pdo->prepare('SELECT id FROM players WHERE id = ? FOR UPDATE');
                $lock->execute([$p['id']]);
                if (!$lock->fetchColumn()) {
                    throw new RuntimeException('Compte introuvable.');
                }
                $owned = $pdo->prepare('SELECT pr.rooms FROM player_properties pp
                                        JOIN properties pr ON pr.id = pp.property_id
                                        WHERE pp.player_id = ? AND pp.property_id = ?');
                $owned->execute([$p['id'], $propertyId]);
                $property = $owned->fetch();
                if (!$property) {
                    throw new RuntimeException('Cette maison ne t\'appartient pas.');
                }

                $count = $pdo->prepare('SELECT COUNT(*) FROM placed_furniture WHERE property_id = ?');
                $count->execute([$propertyId]);
                if ((int)$count->fetchColumn() >= 60) {
                    throw new RuntimeException('Cette maison est pleine (60 meubles maximum).');
                }
                $available = array_filter(
                    furniture_inventory((int)$p['id']),
                    static fn($item) => (int)$item['id'] === $furnitureId && (int)$item['left_qty'] > 0,
                );
                if (!$available) {
                    throw new RuntimeException('Tu n\'as plus ce meuble en stock.');
                }

                [$x, $z, $rotation] = clamp_pose(room_size((int)$property['rooms']), $in);
                $pdo->prepare('INSERT INTO placed_furniture (player_id, property_id, furniture_id, x, z, rot)
                               VALUES (?,?,?,?,?,?)')
                    ->execute([$p['id'], $propertyId, $furnitureId, $x, $z, $rotation]);
                $placedId = (int)$pdo->lastInsertId();
                $pdo->commit();
            } catch (RuntimeException $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                fail($e->getMessage());
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $e;
            }
            json_out(['ok' => true, 'id' => $placedId, 'x' => $x, 'z' => $z, 'rot' => $rotation]);
        }

        case 'move_furniture': {
            $p = require_login();
            $in = input();
            $placedId = (int)($in['id'] ?? 0);
            $st = db()->prepare('SELECT pr.rooms FROM placed_furniture pl
                                 JOIN properties pr ON pr.id = pl.property_id
                                 WHERE pl.id = ? AND pl.player_id = ?');
            $st->execute([$placedId, $p['id']]);
            $placed = $st->fetch();
            if (!$placed) {
                fail('Meuble introuvable.', 404);
            }
            [$x, $z, $rotation] = clamp_pose(room_size((int)$placed['rooms']), $in);
            db()->prepare('UPDATE placed_furniture SET x = ?, z = ?, rot = ? WHERE id = ? AND player_id = ?')
                ->execute([$x, $z, $rotation, $placedId, $p['id']]);
            json_out(['ok' => true, 'x' => $x, 'z' => $z, 'rot' => $rotation]);
        }

        case 'remove_furniture': {
            $p = require_login();
            $st = db()->prepare('DELETE FROM placed_furniture WHERE id = ? AND player_id = ?');
            $st->execute([(int)(input()['id'] ?? 0), $p['id']]);
            if ($st->rowCount() === 0) {
                fail('Meuble introuvable.', 404);
            }
            json_out(['ok' => true]);
        }

        // ---------- Véhicules ----------
        case 'vehicles':
            require_login();
            json_out(['ok' => true, 'vehicles' => db()->query('SELECT * FROM vehicles ORDER BY price')->fetchAll()]);

        case 'buy_vehicle': {
            $p = require_login();
            $vid = (int)(input()['vehicle_id'] ?? 0);
            $pdo = db();
            $pdo->beginTransaction();
            try {
                $st = $pdo->prepare('SELECT cash FROM players WHERE id = ? FOR UPDATE');
                $st->execute([$p['id']]);
                $cash = (int)$st->fetchColumn();
                $st = $pdo->prepare('SELECT * FROM vehicles WHERE id = ?');
                $st->execute([$vid]);
                $v = $st->fetch();
                if (!$v) {
                    throw new RuntimeException('Véhicule introuvable.');
                }
                if ($cash < (int)$v['price']) {
                    throw new RuntimeException('Pas assez d\'argent liquide.');
                }
                $plate = sprintf('%04d %s 01', random_int(1000, 9999), chr(random_int(65, 90)) . chr(random_int(65, 90)));
                $pdo->prepare('INSERT INTO player_vehicles (player_id, vehicle_id, plate) VALUES (?,?,?)')
                    ->execute([$p['id'], $vid, $plate]);
                $pdo->prepare('UPDATE players SET cash = cash - ? WHERE id = ?')->execute([$v['price'], $p['id']]);
                log_tx((int)$p['id'], 'achat', -(int)$v['price'], 'Achat : ' . $v['name']);
                $pdo->commit();
            } catch (RuntimeException $e) {
                $pdo->rollBack();
                fail($e->getMessage());
            } catch (Throwable $e) {
                $pdo->rollBack();
                throw $e;
            }
            json_out(['ok' => true]);
        }

        case 'garage': {
            $p = require_login();
            $st = db()->prepare('SELECT pv.id, pv.plate, pv.fuel, v.name, v.type, v.max_speed
                                 FROM player_vehicles pv JOIN vehicles v ON v.id = pv.vehicle_id
                                 WHERE pv.player_id = ?');
            $st->execute([$p['id']]);
            json_out(['ok' => true, 'vehicles' => $st->fetchAll()]);
        }

        // ---------- Emplois ----------
        case 'jobs':
            require_login();
            json_out(['ok' => true, 'jobs' => db()->query('SELECT * FROM jobs ORDER BY min_level, daily_pay')->fetchAll()]);

        case 'apply_job': {
            $p = require_login();
            $jid = (int)(input()['job_id'] ?? 0);
            $st = db()->prepare('SELECT * FROM jobs WHERE id = ?');
            $st->execute([$jid]);
            $job = $st->fetch();
            if (!$job) {
                fail('Emploi introuvable.');
            }
            if ((int)$p['level'] < (int)$job['min_level']) {
                fail('Niveau ' . $job['min_level'] . ' requis.');
            }
            db()->prepare('REPLACE INTO player_jobs (player_id, job_id) VALUES (?,?)')->execute([$p['id'], $jid]);
            json_out(['ok' => true]);
        }

        case 'work': {
            $p = require_login();
            $st = db()->prepare('SELECT j.* FROM player_jobs pj JOIN jobs j ON j.id = pj.job_id WHERE pj.player_id = ?');
            $st->execute([$p['id']]);
            $job = $st->fetch();
            if (!$job) {
                fail('Tu n\'as pas d\'emploi. Postule d\'abord.');
            }
            if ($p['last_work_at']) {
                $wait = (int)$job['cooldown_s'] - (time() - strtotime($p['last_work_at']));
                if ($wait > 0) {
                    fail("Repose-toi encore {$wait} s avant de retravailler.", 429);
                }
            }
            if ((int)$p['energy'] < 10) {
                fail('Tu es trop fatigué pour travailler.');
            }
            if ($job['needs_vehicle'] !== 'aucun') {
                $v = db()->prepare('SELECT COUNT(*) FROM player_vehicles pv JOIN vehicles v ON v.id = pv.vehicle_id
                                    WHERE pv.player_id = ? AND v.type = ?');
                $v->execute([$p['id'], $job['needs_vehicle']]);
                if ((int)$v->fetchColumn() === 0) {
                    fail('Il te faut un véhicule de type « ' . $job['needs_vehicle'] . ' ».');
                }
            }
            db()->prepare('UPDATE players SET cash = cash + ?, energy = energy - 10, hunger = GREATEST(hunger - 5, 0),
                           thirst = GREATEST(thirst - 5, 0), last_work_at = NOW() WHERE id = ?')
                ->execute([$job['daily_pay'], $p['id']]);
            log_tx((int)$p['id'], 'salaire', (int)$job['daily_pay'], 'Salaire : ' . $job['title']);
            add_xp((int)$p['id'], (int)$job['xp_reward']);
            json_out(['ok' => true, 'earned' => (int)$job['daily_pay']]);
        }

        // ---------- Banque ----------
        case 'deposit':
        case 'withdraw': {
            $p = require_login();
            $amount = (int)(input()['amount'] ?? 0);
            if ($amount <= 0) {
                fail('Montant invalide.');
            }
            $pdo = db();
            $pdo->beginTransaction();
            $st = $pdo->prepare('SELECT cash, bank FROM players WHERE id = ? FOR UPDATE');
            $st->execute([$p['id']]);
            $row = $st->fetch();
            if ($action === 'deposit') {
                if ($row['cash'] < $amount) { $pdo->rollBack(); fail('Pas assez de liquide.'); }
                $pdo->prepare('UPDATE players SET cash = cash - ?, bank = bank + ? WHERE id = ?')->execute([$amount, $amount, $p['id']]);
                log_tx((int)$p['id'], 'depot', $amount, 'Dépôt à la banque');
            } else {
                if ($row['bank'] < $amount) { $pdo->rollBack(); fail('Solde bancaire insuffisant.'); }
                $pdo->prepare('UPDATE players SET cash = cash + ?, bank = bank - ? WHERE id = ?')->execute([$amount, $amount, $p['id']]);
                log_tx((int)$p['id'], 'retrait', $amount, 'Retrait à la banque');
            }
            $pdo->commit();
            json_out(['ok' => true]);
        }

        case 'transfer': {
            $p = require_login();
            $to     = trim((string)(input()['to'] ?? ''));
            $amount = (int)(input()['amount'] ?? 0);
            if ($amount <= 0 || $amount > config()['game']['max_transfer']) {
                fail('Montant invalide.');
            }
            $pdo = db();
            $pdo->beginTransaction();
            $dest = $pdo->prepare('SELECT id, username FROM players WHERE username = ?');
            $dest->execute([$to]);
            $d = $dest->fetch();
            if (!$d || (int)$d['id'] === (int)$p['id']) {
                $pdo->rollBack();
                fail('Destinataire invalide.');
            }
            $st = $pdo->prepare('SELECT bank FROM players WHERE id = ? FOR UPDATE');
            $st->execute([$p['id']]);
            if ((int)$st->fetchColumn() < $amount) {
                $pdo->rollBack();
                fail('Solde bancaire insuffisant.');
            }
            $pdo->prepare('UPDATE players SET bank = bank - ? WHERE id = ?')->execute([$amount, $p['id']]);
            $pdo->prepare('UPDATE players SET bank = bank + ? WHERE id = ?')->execute([$amount, $d['id']]);
            log_tx((int)$p['id'], 'virement_envoye', -$amount, 'Virement à ' . $d['username']);
            log_tx((int)$d['id'], 'virement_recu', $amount, 'Virement de ' . $p['username']);
            $pdo->commit();
            json_out(['ok' => true]);
        }

        case 'transactions': {
            $p = require_login();
            $st = db()->prepare('SELECT kind, amount, label, created_at FROM transactions
                                 WHERE player_id = ? ORDER BY id DESC LIMIT 30');
            $st->execute([$p['id']]);
            json_out(['ok' => true, 'transactions' => $st->fetchAll()]);
        }

        // ---------- Besoins vitaux ----------
        case 'eat':
        case 'drink':
        case 'sleep': {
            $p = require_login();
            $cfg = [
                'eat'   => ['col' => 'hunger', 'gain' => 30, 'cost' => 2000, 'label' => 'Repas (garba)'],
                'drink' => ['col' => 'thirst', 'gain' => 30, 'cost' => 500,  'label' => 'Boisson'],
                'sleep' => ['col' => 'energy', 'gain' => 50, 'cost' => 0,    'label' => 'Sommeil'],
            ][$action];
            if ((int)$p['cash'] < $cfg['cost']) {
                fail('Pas assez d\'argent liquide.');
            }
            // $cfg['col'] vient d'une liste fixe : aucun risque d'injection
            db()->prepare("UPDATE players SET {$cfg['col']} = LEAST({$cfg['col']} + ?, 100), cash = cash - ? WHERE id = ?")
                ->execute([$cfg['gain'], $cfg['cost'], $p['id']]);
            if ($cfg['cost'] > 0) {
                log_tx((int)$p['id'], 'achat', -$cfg['cost'], $cfg['label']);
            }
            json_out(['ok' => true]);
        }

        // ---------- Multijoueur : joueurs de la même ville ----------
        case 'online': {
            $p = require_login();
            $st = db()->prepare('SELECT username, level FROM players
                                 WHERE city_id = ? AND last_login_at > (NOW() - INTERVAL 15 MINUTE) AND id <> ?
                                 ORDER BY level DESC LIMIT 50');
            $st->execute([$p['city_id'], $p['id']]);
            json_out(['ok' => true, 'players' => $st->fetchAll()]);
        }

        default:
            fail('Action inconnue.', 404);
    }
} catch (Throwable $e) {
    error_log($e->getMessage());
    fail('Erreur serveur.', 500);
}
