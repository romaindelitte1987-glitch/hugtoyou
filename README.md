# HugToYou

Jeu synchronisé à deux. Chaque salon a deux liens privés distincts.

## Essayer sur Windows

1. Installez [Node.js](https://nodejs.org/) (version 22 ou plus récente), puis décompressez le dossier.
2. Double-cliquez sur `Lancer-HugToYou.cmd` et laissez la fenêtre ouverte.
3. Ouvrez [http://localhost:8787](http://localhost:8787), cliquez sur **Créer un salon privé**, puis saisissez le premier prénom.
4. Copiez le lien d’invitation dans un deuxième onglet et saisissez le second prénom.
5. Dans les deux onglets, ajustez vos choix dans le tableau. Appuyez sur une icône pour passer de **Donner et recevoir** à **Recevoir**, puis **Donner**. Validez, puis appuyez sur **HugToYou** dans chaque onglet.

Sous macOS ou Linux, lancez `node server.js` depuis le dossier, puis ouvrez la même adresse.

## Essayer sur deux téléphones

Une fois l’application hébergée en HTTPS, ouvrez son adresse depuis le premier téléphone. Créez le salon, puis ouvrez le lien d’invitation ou scannez le QR code depuis le deuxième téléphone. L’invitation expire après 15 minutes ou dès que l’autre personne rejoint le salon. Pour un essai local sur le même Wi-Fi, lancez `$env:HOST="0.0.0.0"; node server.js` dans PowerShell et utilisez l’adresse IP locale du PC à la place de `localhost` (port 8787). Le pare-feu doit permettre la connexion sur le réseau privé. Si le bouton de copie est limité en HTTP, copiez le lien affiché manuellement.

## Règles de cette version

- Une mission associe une zone, une action compatible dans le sens du tour et une durée de 20, 40 ou 60 secondes.
- Chaque personne démarre avec trois cœurs et deux pierres. Passer ou laisser s’écouler les dix secondes coûte un cœur. Une pierre permet de relancer les dés. La partie se termine quand quelqu’un perd son dernier cœur.
- Au bout de trente minutes, une mission déjà acceptée continue jusqu’à la fin de son chrono. Chacun peut arrêter la partie à tout moment.
- Les choix sont effacés à la fin de la partie. Le salon expire deux heures après sa création. Le serveur local conserve les salons en mémoire pendant son exécution.

## Dépôt et hébergement

Publiez le contenu du dossier dans un dépôt GitHub privé. Avec un compte Cloudflare autorisé, lancez `npm install`, `npx wrangler login`, puis `npm run deploy`. Le Worker sert la page et synchronise chaque salon dans un Durable Object. Le serveur local ne requiert aucune installation de dépendances. Vérifiez les règles avec `npm test`.
