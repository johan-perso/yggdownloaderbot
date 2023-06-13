// Importer quelques librairies
var { Telegraf } = require('telegraf')
const fetch = require('node-fetch')
const htmlParser = require('node-html-parser')
const humanReadable = require('@tsmx/human-readable')
const WebTorrent = require('webtorrent')
const he = require('he')
require('dotenv').config()

// Parse la liste des utilisateurs autorisés
process.env.AUTHORIZED_USERS = process.env.AUTHORIZED_USERS.split(',').map(user => parseInt(user))

// Initialiser le bot
const bot = new Telegraf(process.env.BOT_TOKEN, { handlerTimeout: 9_000_000 })

// Démarrer le bot
bot.launch().then(() => {
	console.log(`Connecté en tant que @${bot.botInfo.username}`)
})

// Quand la commande /start est executé
bot.command('start', async (ctx) => {
	console.log(`@${ctx.message.from.username || ctx.message.from.first_name} (ID: ${ctx.message.from.id}) a utilisé /start`)
})

// Pour chaque nouveau message
var searchResult = {}
bot.on('message', async (ctx) => {
	// Si c'est une commande, on ignore
	if(ctx.message.text.startsWith('/')) return

	// Log, puis vérifier l'auteur
	var authorId = ctx.message.from.id
	console.log(`@${ctx.message.from.username || ctx.message.from.first_name} (ID: ${authorId}) a envoyé un message`)
	if(!process.env.AUTHORIZED_USERS.includes(authorId)) return console.log("Utilisateur non autorisé") && ctx.replyWithHTML("Vous n'êtes pas autorisé à utiliser ce bot").catch(err => {})

	// On va tenter de split à chaque espace, puis de convertir en nombre, si ça marche, on télécharge le torrent
	var split = ctx.message.text.split(' ')
	if(split.length > 0 && split.every(number => !isNaN(number))){
		// Obtenir les torrents
		var torrents = searchResult?.[authorId]?.filter((torrent,i) => split.includes((i+1).toString()))
		if(!torrents?.length) return ctx.replyWithHTML("Aucun résultat trouvé").catch(err => {})

		// Initialiser le client torrent
		var client = new WebTorrent()

		// Télécharger chaque torrents
		for(var torrent of torrents){
			// Obtenir le code de la page du torrent
			var download = await fetch(torrent.link).then(res => res.text()).catch(err => { return err })
			download = htmlParser.parse(download)

			// Obtenir le lien de téléchargement sur cette page
			if(torrent.link.startsWith('https://www.cpasbien.sk')) var downloadLink = download.querySelector("div.btn-download > a").getAttribute('href') ? `https://www.cpasbien.sk${download.querySelector("div.btn-download > a").getAttribute('href')}` : null
			else var downloadLink = download.querySelector("table.infos-torrent > tbody").querySelector('a.butt').getAttribute('href')

			// Si on a pas de lien, on le dit, et si on l'a, on le dit aussi
			if(!downloadLink) return ctx.replyWithHTML("Impossible de trouver le lien de téléchargement").catch(err => {})
			ctx.replyWithHTML(`Le lien a été trouvé !${process.env.TORRENTS_PATH ? ` Veuillez patienter pendant le téléchargement ${downloadLink.startsWith('http') ? `de <u>${downloadLink}</u>` : 'du torrent'}` : `\n${downloadLink}`}`).catch(err => {})

			// Ajouter le torrent au client
			if(process.env.TORRENTS_PATH){
				var promise = new Promise((resolve, reject) => {
					client.add(downloadLink, { downloadLimit: -1, path: process.env.TORRENTS_PATH }, torrent => {
						console.log('Téléchargement du torrent: ' + torrent.name)
						ctx.replyWithHTML(`Téléchargement du torrent : <b>${torrent.name}</b> (${humanReadable.fromBytes(torrent.length)})`).catch(err => {})
						torrent.on('done', () => {
							console.log('Téléchargement terminé')
							ctx.replyWithHTML(`Téléchargement terminé de : <b>${torrent.name}</b> (${humanReadable.fromBytes(torrent.length)}). Vous pouvez le retrouver sur Plex après avoir réactualisé l'index.`).catch(err => {})
							torrent.destroy()
							if(torrents.indexOf(torrent) == torrents.length-1) client.destroy()
							resolve()
						})
						torrent.on('download', bytes => {
							console.log(`${humanReadable.fromBytes(torrent.downloaded)} / ${humanReadable.fromBytes(torrent.length)}`)
							console.log('Vitesse: ' + humanReadable.fromBytes(torrent.downloadSpeed) + '/s')
						})
						torrent.on('error', err => {
							console.log(err)
							ctx.replyWithHTML("Une erreur est survenue pendant le téléchargement, vérifier la console pour plus d'informations.").catch(err => {})
							torrent.destroy()
							client.destroy()
						})
					})
				})
				await promise
			}

			// On attend un peu avant de télécharger le prochain torrent
			await new Promise(resolve => setTimeout(resolve, process.env.TORRENTS_PATH ? 1500 : 800))
		}
	}

	// Sinon, on fait une recherche
	else {
		// Si c'est un lien Plex (ex: https://watch.plex.tv/movie/untitled-illumination-entertainment-project-2022-2)
		if(ctx.message.text.startsWith('https://watch.plex.tv/')){
			// Obtenir le nom du film
			var _movie = await fetch(ctx.message.text).then(res => res.text()).catch(err => { return err })
			_movie = htmlParser.parse(_movie).querySelector('[data-testid="metadata-title"]').innerText
			if(!_movie) return ctx.replyWithHTML("Impossible de trouver le nom complet de l'œuvre.").catch(err => {})

			// Obtenir le nom du film dans la langue de l'utilisateur
			var movie = await searchMovie(_movie)
			if(!movie) movie = _movie

			// On remplace le message par le nom du film
			ctx.message.text = movie
		}

		// Obtenir les torrents
		console.log(`Recherche de « ${ctx.message.text} »`)
		var torrents = await searchTorrents(ctx.message.text).catch(err => { return err })
		if(!torrents?.length) return ctx.replyWithHTML("Impossible de trouver des torrents pour cette recherche").catch(err => {})
		console.log(torrents)

		// On enregistre les résultats
		searchResult[authorId] = torrents

		// On envoie les torrents
		await ctx.replyWithHTML(torrents.slice(0, 20).map((torrent,i) => {
			return `<u>${i+1}.</u> <b>${torrent.title}</b>\n<b>Seeders:</b> ${torrent.seeders}\n<b>Taille:</b> ${torrent.size}`
		}).join('\n\n').substring(0, 4096)).catch(err => {})
		if(torrents.length > 20) await ctx.replyWithHTML(torrents.slice(20, 40).map((torrent,i) => {
			return `<u>${i+21}.</u> <b>${torrent.title}</b>\n<b>Seeders:</b> ${torrent.seeders}\n<b>Taille:</b> ${torrent.size}`
		}).join('\n\n').substring(0, 4096)).catch(err => {})
		await ctx.replyWithHTML("Recherche terminée ! Entrer le numéro du résultat, ou plusieurs numéros séparés par un espace pour commencer le téléchargement.").catch(err => {})
	}
})

// Fonction pour chercher le nom d'un film dans la langue de l'utilisateur
async function searchMovie(query){
	var movies = await fetch(`https://www.themoviedb.org/search?query=${query}&language=fr-FR`).then(res => res.text()).catch(err => { return err })
	movies = htmlParser.parse(movies).querySelectorAll('div.search_results.movie > div > div').map(movie => movie.querySelector('h2')?.innerText ? movie.querySelector('h2').innerText : null).filter(movie => movie)
	return movies?.[0] || null
}

// Fonction pour chercher des torrents
async function searchTorrents(query){
	// Simplifier la recherche
	query = he.decode(query).replace(/[^a-zA-Z0-9': ]/g, '')

	// YGGTorrent
	var torrents_ygg = await fetch(`https://www5.yggtorrent.ac/recherche/${query}`).then(res => res.text()).catch(err => { return err })
	torrents_ygg = htmlParser.parse(torrents_ygg).querySelectorAll('table.table tbody tr').map(torrent => {
		var title = torrent.querySelector('a').innerText
		var link = torrent.querySelector('a').getAttribute('href')
		var seeders = parseInt(torrent.querySelector('.seed_ok').innerText.trim())
		var size = torrent.querySelector('[style="font-size:12px"]').innerText
		return { title, link, seeders, size }
	})

	// Cpasbien
	var torrents_cpasbien = await fetch(`https://www.cpasbien.sk/recherche/${query}`).then(res => res.text()).catch(err => { return err })
	torrents_cpasbien = htmlParser.parse(torrents_cpasbien).querySelectorAll('table > tbody > tr').map(torrent => {
		var title = torrent.querySelector('a').innerText
		var link = torrent.querySelector('a').getAttribute('href') ? `https://www.cpasbien.sk${torrent.querySelector('a').getAttribute('href')}` : null
		var seeders = parseInt(torrent.querySelector('.up').innerText)
		var size = torrent.querySelector('.poid').innerText
		return { title, link, seeders, size }
	})

	// On supprime tout ceux qui n'ont pas de liens ou de titre
	torrents_ygg = torrents_ygg.filter(torrent => torrent.link && torrent.title)

	// Tout réunir dans une variable et éliminer ceux dont le nom est en doublon
	var _torrents = [...torrents_ygg, ...torrents_cpasbien]
	_torrents = _torrents.filter((torrent, i) => _torrents.findIndex(t => t.title == torrent.title) == i)
	var torrents = _torrents.filter(torrent => torrent.seeders > 4)

	// Si on a pas beaucoup de résultats, on filtre ceux avec un seed supérieur à 0
	if(torrents.length < 15) torrents = _torrents.filter(torrent => torrent.seeders > 0)
	
	// On trie pour que les torrents avec un seed en dessous de 5 soient en dernier
	var torrents_1 = torrents.filter(torrent => torrent.seeders < 5)
	var torrents_2 = torrents.filter(torrent => torrent.seeders >= 5)
	torrents = [...torrents_2, ...torrents_1]

	// On retourne
	return torrents.slice(0, 40) || []
}
