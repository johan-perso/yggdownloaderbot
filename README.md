# yggDownloaderBot

Ce bot Telegram vous permet de rechercher et télécharger des torrents depuis les plateformes d'YggTorrent et de "Cpasbien". Cela peut être utilisé pour faciliter le téléchargement de fichiers sur un serveur de médias comme Plex ou un NAS, mais aussi pour faire des recherches depuis votre téléphone puisqu'il est possible de désactiver le téléchargement des fichiers depuis le bot.


## Fonctionnalités

- Recherche de torrents sur plusieurs plateformes
- Affichage de la taille des fichiers, et du nombre de seeders
- Possibilité de télécharger les torrents sur le serveur
- Supporte les recherches à partir de liens Plex (ex: https://watch.plex.tv/movie/avatar-2)
- Filtre les torrents en fonction du nombre de seeders

## Installation

> **___⚠️ Disclaimer :___ Ce bot vous est proposé à but éducatif, je ne suis responsable de l'utilisation que vous en faites. Veillez à respecter les lois en vigueur dans votre pays. Un VPN peut être utilisé pour plus de sécurité.**

### Prérequis

- [Node.js](https://nodejs.org/en/) (version 14 ou supérieure)
- Un compte [Telegram](https://telegram.org/)
- Le token d'un bot Telegram (utiliser [BotFather](https://t.me/botfather))

### Installation

1. Cloner le repository
```sh
git clone https://github.com/johan-perso/yggdownloaderbot.git
```

2. Installer les dépendances
```sh
cd yggdownloaderbot
npm install
# ou "pnpm install" si vous utilisez pnpm
```

3. Créer un fichier `.env` à la racine du projet, et y ajouter les variables suivantes :
```sh
BOT_TOKEN=token_du_bot_telegram # Token du bot Telegram, obtenu avec BotFather
AUTHORIZED_USERS=123456789,987654321 # Liste des IDs des utilisateurs autorisés, séparés par des virgules. Obtenir son ID : https://www.youtube.com/watch?v=e_d3KqI6zkI
TORRENTS_PATH= # Chemin vers le dossier où seront téléchargés les torrents. Exemple : /home/user/torrents. Si non renseigné, les torrents ne seront pas téléchargés.
```

4. Lancer le bot
```sh
npm start
# ou vous pouvez utiliser pm2 pour le lancer en arrière plan
pm2 start index.js --name "yggdownloaderbot"
```

## Utilisation

Pour effectuer une recherche, vous n'avez qu'à envoyer le terme que vous souhaitez chercher par message au bot (par exemple : `avatar 2`).

> Vous pouvez également rechercher un film ou une série sur Plex, et copier le lien de la page (qui commence par `https://watch.plex.tv/movie/` ou `https://watch.plex.tv/show/`).

Le bot vous répondra avec une liste de résultats, vous pourrez choisir lequel télécharger en envoyant un nouveau message avec le numéro du résultat (par exemple : `1`).

> Vous pouvez aussi télécharger plusieurs résultats en envoyant plusieurs numéros séparés par un espace (par exemple : `1 3 5`).

Si vous avez renseigné le chemin vers le dossier de téléchargement des torrents (`TORRENTS_PATH` dans le fichier .env), le bot téléchargera le fichier dans ce dossier. Sinon, il ne vous enverra que le lien du torrent (vous pourrez utiliser une application comme [bittorrent](https://www.bittorrent.com/) pour le télécharger).


## Licence

MIT © [Johan](https://johanstick.me)
