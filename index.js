// Importer quelques librairies
var { Telegraf } = require('telegraf')
const fs = require('fs')
const path = require('path')
const fetch = require('node-fetch')
const htmlParser = require('node-html-parser')
const humanReadable = require('@tsmx/human-readable')
const WebTorrent = require('webtorrent')
const he = require('he')
const ffmpeg = require('fluent-ffmpeg')
const ytdl = require('ytdl-core')
const { getVideo, getPlaylist } = require('@fabricio-191/youtube').setDefaultOptions({ location: 'FR', language: 'fr-FR' })
const Genius = require("genius-lyrics"); const GeniusClient = new Genius.Client()
require('dotenv').config()

// Parse la liste des utilisateurs autorisés
var authorizedUsers = process.env.AUTHORIZED_USERS.split(',').map(user => parseInt(user))

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
	// Si le message a été envoyé avant le démarrage du bot, on ignore
	if(ctx.message.date < Math.floor(Date.now() / 1000) - 10) return

	// Si c'est une commande, on ignore
	if(ctx.message.text.startsWith('/')) return

	// Log, puis vérifier l'auteur
	var authorId = ctx.message.from.id
	console.log(`@${ctx.message.from.username || ctx.message.from.first_name} (ID: ${authorId}) a envoyé un message`)
	if(!authorizedUsers.includes(authorId)) return console.log("Utilisateur non autorisé") && ctx.replyWithHTML("Vous n'êtes pas autorisé à utiliser ce bot").catch(err => {})

	// On va tenter de split à chaque espace, puis de convertir en nombre, si ça marche, on télécharge le torrent
	// Mais on télécharge aussi si c'est un lien
	console.log(ctx.message.text)
	var split = ctx.message.text.split(' ')
	if(((ctx.message.text.startsWith('http://') || ctx.message.text.startsWith('https://')) && !ctx.message.text.startsWith('https://watch.plex.tv/')) || (split.length > 0 && split.every(number => !isNaN(number)))){
		// Supporter les téléchargements à partir de YouTube
		if(ctx.message.text.startsWith('https://youtube.com/') || ctx.message.text.startsWith('https://www.youtube.com/') || ctx.message.text.startsWith('https://youtu.be/') || ctx.message.text.startsWith('https://music.youtube.com/')){
			// Si on a pas de chemin de téléchargement, on le dit
			if(!process.env.DOWNLOAD_PATH) return ctx.replyWithHTML("Veuillez configurer le chemin de téléchargement dans le fichier .env pour utiliser cette fonctionnalité.").catch(err => {})

			// Déterminer si c'est une playlist ou une vidéo, et si c'est une musique ou une vidéo
			var isPlaylist = ctx.message.text.includes('/playlist?list=')
			var isMusic = ctx.message.text.startsWith('https://music.youtube.com/')

			// Obtenir la liste des vidéos à télécharger
			var toDownload
			try {
				toDownload = isPlaylist ? await getPlaylist(ctx.message.text) : {videos:[await getVideo(ctx.message.text)]}
			} catch(e){}
			if(toDownload?.videos) toDownload.videos = toDownload.videos.filter(video => video)
			if(!toDownload?.videos?.length) return ctx.replyWithHTML("Impossible de trouver des vidéos pour cette recherche").catch(err => {})

			// Obtenir le chemin qu'on va utiliser pour enregistrer les musiques
			if(!isPlaylist) var downloadPath = path.join(process.env.DOWNLOAD_PATH)
			else var downloadPath = path.join(process.env.DOWNLOAD_PATH, toDownload.name.replace(/[^\w\s\dàáâäãåçèéêëìíîïñòóôöõøùúûüýÿ]/g, '').length ? toDownload.name.replace(/[^\w\s\dàáâäãåçèéêëìíîïñòóôöõøùúûüýÿ]/g, '').trim() : toDownload.ID)

			// On crée le dossier de téléchargement si il n'existe pas
			if(!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath)
			if(isMusic && !fs.existsSync(path.join(downloadPath, 'lyrics'))) fs.mkdirSync(path.join(downloadPath, 'lyrics'))

			// Dire à l'utilisateur qu'on va commencé le téléchargement
			ctx.replyWithHTML(`Téléchargement de <b>${toDownload.name || toDownload?.videos?.[0]?.title || toDownload?.videos?.[0]?.name || toDownload.ID}</b> (${toDownload.videos.length} vidéo${toDownload.videos.length > 1 ? 's' : ''})`).catch(err => {})

			// On enregistre tout
			for(var i = 0; i < toDownload.videos.length; i++){
				// Rendre les titres plus propres
				toDownload.videos[i].title = (toDownload.videos[i].title || toDownload.videos[i].name).replace(/[^\w\s\dàáâäãåçèéêëìíîïñòóôöõøùúûüýÿ]/g, '').replace(/ +/g, ' ').replace(/audio officiel/gi, '').replace(/clip video/gi, '').replace(/clip officiel/gi, '').replace(/clip/gi, '').replace(/Visualizer/gi, '').replace(/video officielle/gi, '').replace(/vidéo officielle/gi, '').replace(/official music video/gi, '').replace(/official audio/gi, '').trim()

				// Si le fichier existe déjà, on passe au suivant
				if(fs.existsSync(path.join(downloadPath, `${toDownload.videos[i].title}.mp${isMusic ? '3' : '4'}}`))){
					if(i == toDownload.videos.length-1) ctx.replyWithHTML(`Cette vidéo est déjà présente.`).catch(err => {}) // Si c'était la dernière vidéo, on envoie un message
					continue
				}

				// On télécharge en .mp4
				var video = toDownload.videos[i]
				if(isMusic) var infos = await getMusicInfo(video.title, video.owner.name); else var infos = {}
				var stream
				try {
					if(!isMusic) stream = ytdl(video.URL, { filter: 'audioandvideo' })
					else stream = ytdl(video.URL, { quality: 'highestaudio' })
					stream.pipe(fs.createWriteStream(path.join(downloadPath, `${video.title}.mp4`)))
				} catch(e){}

				// On attend avant de continuer :
				await new Promise(resolve => {
					// Si la vidéo n'est pas disponible, on passe au suivant
					stream.on('error', (e) => {
						console.log(e)
						console.log(`Passage de la vidéo "${video.title} - ${video.owner.name}" car elle n'est pas disponible (limite d'âge ?)`)
						ctx.replyWithHTML(`Passage de la vidéo "${video.title} - ${video.owner.name}" car elle n'est pas disponible (limite d'âge ?)`).catch(err => {})
						if(fs.existsSync(path.join(downloadPath, `${video.title}.mp4`))) fs.unlinkSync(path.join(downloadPath, `${video.title}.mp4`))
						resolve()
					})

					// On attend que le téléchargement soit terminé, puis on converti en .mp3 et on supprime le .mp4
					stream.on('end', async () => {
						// Si c'est une musique :
						if(isMusic){
							// On converti en .mp3
							var proc = ffmpeg(path.join(downloadPath, `${video.title}.mp4`))
							.outputOptions('-metadata', `title=${infos.title || ''}`, '-metadata', `artist=${infos.artist || ''}`, '-metadata', `album=${infos.album || ''}`, '-metadata', `lyrics=${infos.lyrics || ''}`)
							.toFormat('mp3')
							.save(path.join(downloadPath, `${video.title}.mp3`))
							.on('error', console.error)
							await new Promise(resolve => proc.on('end', resolve))

							// On supprime le .mp4
							fs.unlinkSync(path.join(downloadPath, `${video.title}.mp4`))

							// Générer un fichier avec les paroles
							if(infos.lyrics) fs.writeFileSync(path.join(downloadPath, 'lyrics', `${video.title}.txt`), infos.lyrics)
						}

						// On affiche un message, et on continue après 500ms
						console.log(`[${i + 1}/${toDownload.videos.length}] ${infos.title && infos.artist ? `${infos.title} - ${infos.artist}` : `{infos partielles} ${video.title} - ${video.owner.name}`}`)
						setTimeout(resolve, 500)
					})
				})

				// Si c'est la dernière vidéo, on envoie un message
				if(i == toDownload.videos.length-1) ctx.replyWithHTML(`Téléchargement terminé de <b>${toDownload.name || video.title || toDownload.ID}</b> (${toDownload.videos.length} vidéo${toDownload.videos.length > 1 ? 's' : ''}). Vous pouvez le retrouver sur Plex après avoir réactualisé l'index.`).catch(err => {})
			}
		} else {
			// Si c'est déjà un lien, on le met dans un tableau
			var torrents
			var downloadLink
			if(ctx.message.text.startsWith('http://') || ctx.message.text.startsWith('https://')) torrents = [ctx.message.text.trim()], downloadLink = ctx.message.text.trim()

			// Sinon, on récupère les torrents depuis la recherche
			else torrents = searchResult?.[authorId]?.filter((torrent,i) => split.includes((i+1).toString()))
			if(!torrents?.length) return ctx.replyWithHTML("Aucun résultat trouvé").catch(err => {})

			// Initialiser le client torrent
			var client = new WebTorrent()

			// Télécharger chaque torrents
			for(var torrent of torrents){
				// Si on a pas encore le lien
				if(!downloadLink){
					// Obtenir le code de la page du torrent
					var download = await fetch(torrent.link).then(res => res.text()).catch(err => { return err })
					download = htmlParser.parse(download)

					// Obtenir le lien de téléchargement sur cette page
					if(torrent.link.startsWith('https://www.cpasbien.sk')) downloadLink = download.querySelector("div.btn-download > a").getAttribute('href') ? `https://www.cpasbien.sk${download.querySelector("div.btn-download > a").getAttribute('href')}` : null
					else downloadLink = download.querySelector("table.infos-torrent > tbody").querySelector('a.butt').getAttribute('href')

					// Si on a pas de lien, on le dit, et si on l'a, on le dit aussi
					if(!downloadLink) return ctx.replyWithHTML("Impossible de trouver le lien de téléchargement").catch(err => {})
					ctx.replyWithHTML(`Le lien a été trouvé !${process.env.DOWNLOAD_PATH ? ` Veuillez patienter pendant le téléchargement ${downloadLink.startsWith('http') ? `de <u>${downloadLink}</u>` : 'du torrent'}` : `\n${downloadLink}`}`).catch(err => {})
				}

				// Ajouter le torrent au client
				if(process.env.DOWNLOAD_PATH){
					var promise = new Promise((resolve, reject) => {
						client.add(downloadLink, { downloadLimit: -1, path: process.env.DOWNLOAD_PATH }, torrent => {
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
								console.error(err)
								ctx.replyWithHTML("Une erreur est survenue pendant le téléchargement, vérifier la console pour plus d'informations.").catch(err => {})
								torrent.destroy()
								client.destroy()
							})
						})
						client.on('error', err => {
							console.error(err)
							ctx.replyWithHTML("Une erreur est survenue pendant le téléchargement, vérifier la console pour plus d'informations.").catch(err => {})
							client.destroy()
						})
					})
					await promise
				}

				// On attend un peu avant de télécharger le prochain torrent
				await new Promise(resolve => setTimeout(resolve, process.env.DOWNLOAD_PATH ? 1500 : 800))
			}
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

		// On enregistre les résultats
		searchResult[authorId] = torrents

		// On envoie les torrents
		await ctx.replyWithHTML(torrents.slice(0, 20).map((torrent,i) => {
			return `<u>${i+1}.</u> <b>${torrent.title}</b>\n<b>Seeders:</b> ${torrent.seeders}\n<b>Taille:</b> ${torrent.size}`
		}).join('\n\n').substring(0, 4096)).catch(err => {})
		if(torrents.length > 20) await ctx.replyWithHTML(torrents.slice(20, 40).map((torrent,i) => {
			return `<u>${i+21}.</u> <b>${torrent.title}</b>\n<b>Seeders:</b> ${torrent.seeders}\n<b>Taille:</b> ${torrent.size}`
		}).join('\n\n').substring(0, 4096)).catch(err => {})
		if(torrents.length > 40) await ctx.replyWithHTML(torrents.slice(40, 60).map((torrent,i) => {
			return `<u>${i+41}.</u> <b>${torrent.title}</b>\n<b>Seeders:</b> ${torrent.seeders}\n<b>Taille:</b> ${torrent.size}`
		}).join('\n\n').substring(0, 4096)).catch(err => {})
		await ctx.replyWithHTML("Recherche terminée ! Entrer le numéro du résultat, ou plusieurs numéros séparés par un espace pour commencer le téléchargement.").catch(err => {})
	}
})

// Obtenir les informations sur un son
async function getMusicInfo(title, artist){
	// Obtenir les informations de la musique
	var results = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(title + ' ' + artist)}`).then(res => res.json())
	if(!results?.data?.length) results = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(title)}`).then(res => res.json()) // Si on ne trouve pas de musique avec le nom de l'artiste, on cherche sans

	// Parse d'une meilleure façon les informations
	var result = results?.data?.[0]
	result = {
		title: result?.title,
		artist: result?.artist?.name,
		album: result?.album?.title
	}
	if(!result?.title || !result?.artist) return false // Si on ne trouve pas de musique, on retourne false

	// Obtenir les paroles de la musique
	var lyrics
	try {
		lyrics = await GeniusClient.songs.search(`${result?.title || title} ${result?.artist || artist}`)
		if(lyrics) lyrics = await lyrics?.[0]?.lyrics()
		if(lyrics) lyrics = lyrics.replace(/\[.*\]/g, '').replace(/\n\n/g, '\n').trim()
	} catch(e){}
	if(typeof lyrics !== 'string') lyrics = undefined // Si on ne trouve pas les paroles, on retourne undefined (pour ne pas avoir de metadata

	// Retourner les informations
	return { ...result, lyrics }
}

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
	return torrents.slice(0, 60) || []
}
