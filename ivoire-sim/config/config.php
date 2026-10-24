<?php
// Configuration d'Ivoire Sim — adapte ces valeurs à ton serveur (XAMPP / WAMP / hébergeur)
declare(strict_types=1);

return [
    'db' => [
        'host'    => '127.0.0.1',
        'name'    => 'ivoire_sim',
        'user'    => 'root',
        'pass'    => '',
        'charset' => 'utf8mb4',
    ],
    'game' => [
        'start_cash'      => 100000,   // FCFA donnés à l'inscription
        'arrival_bonus'   => 1000000,  // Bonus unique accordé à la première arrivée en ville
        'level_xp_step'   => 100,      // XP nécessaire par niveau (niveau = 1 + xp / 100)
        'max_transfer'    => 50000000, // plafond d'un virement
    ],
];
