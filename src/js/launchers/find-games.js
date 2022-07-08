/* eslint-disable indent */
let lastCheck;
let cachedGames = [];
const games_blacklist = [
	'228980', // Steamworks Common Redistributables
	'231350', // 3D Mark Demo
];
let running = false;
const processes = new Map();

const fs = require('fs');
const path = require('path');
const APP_BASE_PATH = path.join(__dirname, path.relative(__dirname, './'));

const { ipcRenderer } = require('electron');
const { spawn } = require('child_process');
const { log } = require('electron-log');

console.debug('OS:', process.platform, 'Arch:', process.arch);
const Constants = require('../../../util/Constants.json');
const mc = require('./Minecraft.js');

const getInstalledGames = async () => {
	// Cooldown
	if (!lastCheck) {
		lastCheck = Date.now();
	}
	else if (lastCheck + 1000 * 60 * 10 > Date.now()) {
		return `COOLDOWN_${(lastCheck + 1000 * 60 * 10) - Date.now()}`;
	}
	// Fetch all games
	const games = [];
	// games.push(...(await mc.getInstalledGames()));
	console.log(games);

	if(process.platform === 'win32') {
		const filesInFolder = fs.readdirSync('./src/js/launchers').filter(x => require(`./${x}`).getInstalledGames && x !== 'find-games.js')
			.map(async x => await require(`./${x}`).getInstalledGames());
		filesInFolder.forEach(async x => {
			console.log(await x);
			games.push(await x)
		});
	} else if (process.platform === 'linux') {
		games.push(...(await mc.getInstalledGames()));
	}

	if (games.length < 1) {
		return 'NO_GAMES_FOUND';
	}

	cachedGames = games;
	return games;
};

const loadGames = async (id) => {
	// Prevent duping Game Elements on multiple clicks
	if (running === true) return;
	running = true;

	let games = await getInstalledGames();
	const list = document.getElementById(id) ?? document.getElementById(`${id}List`);

	// Cache results or get from cache if cooldown
	if (typeof games === 'string' && games.startsWith('COOLDOWN')) {
		games = cachedGames;
		list.replaceChildren([]);
	}
	else if (typeof games === 'string') {
		// When games not found
	}
	else if (Array.isArray(games)) {
		cachedGames = games;
	}

	const resolvedGames = sort(games.filter(x => {
		if (games_blacklist.includes(x.GameID)) return false;
		if (id === 'allGames') {
			return true;
		}
		else if (id === 'recentGames') {
			const data = getGames(x.GameID, x.LauncherName);
			return !!data?.Launches;
		}
		else if (id === 'favGames') {
			const data = getGames(x.GameID, x.LauncherName);
			return !!data?.Favourite;
		}
		else if (id.startsWith('recent') && id.includes('Main')) {
			const data = getGames(x.GameID, x.LauncherName);
			return !!data?.Launches;
		}
	}), id === 'allGames' ? 'alphabetical' : id === 'recentGames' || (id.startsWith('recent') && id.includes('Main')) ? 'lastLaunch' : 'none').map((game) => {
		// Gamebox creation
		const gameElement = document.createElement('div');
		gameElement.id = 'game-div-' + game.DisplayName;
		gameElement.className += id.startsWith('recent') && id.includes('Main') ? 'mainPageGamebox' : 'gamebox';
		gameElement.style.diplay = 'table';
		list.appendChild(gameElement);

		// Game Banner creation
		const gameBanner = document.createElement('img');
		let banner;
		if (game.LauncherName !== 'XboxGames') {
			if (fs.existsSync(Constants.GAME_BANNERS_BASE_PATH)) {
				const dirs = fs.readdirSync(Constants.GAME_BANNERS_BASE_PATH);
				const md5 = require('md5');
				const img = dirs.find(x => x === `${md5(game.DisplayName)}.png`);
				banner = img ? `${APP_BASE_PATH}/storage/Cache/Games/Images/${img}` : '../img/icons/icon.ico';
			}
			else {
				banner = '../img/icons/icon.ico';
			}
		}
		else {
			banner = game.Banner;
		}
		gameBanner.setAttribute('src', banner);
		gameBanner.style = `opacity: ${id === 'allGames' ? '0.2' : '1'};`;
		gameBanner.height = 500;
		gameBanner.width = 500;
		gameElement.appendChild(gameBanner);

		game.Banner = banner;

		if (id.startsWith('recent') && id.includes('Main')) return game;

		// Set Game Display Name
		const gameText = document.createElement('span');
		if (game.DisplayName.length > 18) {
			gameText.innerHTML = game.DisplayName.slice(0, 18);
			gameText.innerHTML += '...';
		}
		else {
			gameText.innerHTML = game.DisplayName;
		}
		gameElement.appendChild(gameText);

		gameBanner.addEventListener('click', () => {
			handleLaunch(game);
			ipcRenderer.send('min-tray');
		});

		if (id !== 'allGames') return game;

		// Handle starring
		const starIcon = document.createElement('div');
		starIcon.classList.add('star');
		gameElement.appendChild(starIcon);

		gameBanner.addEventListener('mouseover', () => {
			const x = gameElement.getElementsByClassName('star');
			const isFavourite = JSON.parse(fs.readFileSync(APP_BASE_PATH + '/storage/Cache/Games/Data.json').toString()).Games.find(y => y.GameID === game.GameID && y.LauncherName === game.LauncherName && y.Favourite);
			for (let i = 0; i < x.length; i++) {
				starIcon.classList.add('fade');
				x[i].style.visibility = 'visible';
				if (isFavourite) {
					starIcon.style.content = 'url("../img/star-solid.svg")';
					starIcon.style.filter = 'invert(77%) sepia(68%) saturate(616%) hue-rotate(358deg) brightness(100%) contrast(104%)';
				}
			}
		});

		gameBanner.addEventListener('mouseout', () => {
			const x = gameElement.getElementsByClassName('star');
			const isFavourite = JSON.parse(fs.readFileSync(APP_BASE_PATH + '/storage/Cache/Games/Data.json').toString()).Games.find(y => y.GameID === game.GameID && y.LauncherName === game.LauncherName && y.Favourite);
			for (let i = 0; i < x.length; i++) {
				if (!x[i].matches(':hover')) {
					starIcon.classList.remove('fade');
					x[i].style.visibility = 'hidden';
					if (!isFavourite) {
						starIcon.style.content = 'url("../img/star-empty.svg")';
						starIcon.style.filter = 'invert(100%) sepia(0%) saturate(1489%) hue-rotate(35deg) brightness(116%) contrast(100%)';
					}
				}
			}
		});
		document.addEventListener('mousemove', () => {
			if (!gameBanner.matches(':hover') && !starIcon.matches(':hover')) starIcon.style.visibility = 'hidden';
		});

		starIcon.addEventListener('click', () => {
			const res = toggleFavourite(game.GameID, game.LauncherName);
			starIcon.style.content = `url("../img/star-${res ? 'solid' : 'empty'}.svg")`;
			starIcon.style.filter = res ? 'invert(77%) sepia(68%) saturate(616%) hue-rotate(358deg) brightness(100%) contrast(104%)' : 'invert(100%) sepia(0%) saturate(1489%) hue-rotate(35deg) brightness(116%) contrast(100%)';
		});

		return game;
	}).filter(x => Object.keys(x).length > 0);

	setGames({ Games: getGames().Games.length < games.length ? games : getGames().Games });
	ipcRenderer.send('load-banners-request', resolvedGames.filter((x) => x.Banner === '../img/icons/icon.ico'), id);
	running = false;
};

const sort = (games, type) => {
	if (type === 'alphabetical') {
		return games.map(x => x.DisplayName).sort().map(x => games[games.findIndex(y => y.DisplayName === x)]);
	}
	else if (type === 'lastLaunch') {
		const data = getGames().Games;
		return games.filter(x => data.find(y => y.GameID === x.GameID && y.LauncherName === x.LauncherName).LastLaunch).sort((a, b) => data.find(x => x.GameID === b.GameID && x.LauncherName === b.LauncherName).LastLaunch - data.find(x => x.GameID === a.GameID && x.LauncherName === a.LauncherName).LastLaunch);
	}
	return games;
};

const { checkForDirAndCreate: checkDirs } = require('../../utils.js');
const setGames = (games) => {
	if (!fs.existsSync(APP_BASE_PATH + Constants.GAMES_DATA_BASE_PATH.slice(1))) checkDirs(APP_BASE_PATH + Constants.GAMES_DATA_BASE_PATH.slice(1), '{"Games":[]}');
	fs.writeFileSync(APP_BASE_PATH + Constants.GAMES_DATA_BASE_PATH.slice(1), JSON.stringify(games));
};
const getGames = (GameID, LauncherName) => {
	if (!fs.existsSync(APP_BASE_PATH + Constants.GAMES_DATA_BASE_PATH.slice(1))) checkDirs(APP_BASE_PATH + Constants.GAMES_DATA_BASE_PATH.slice(1), '{"Games":[]}');
	return GameID ? JSON.parse(fs.readFileSync(APP_BASE_PATH + Constants.GAMES_DATA_BASE_PATH.slice(1)).toString()).Games.find(x => x.GameID === GameID && x.LauncherName === LauncherName) : JSON.parse(fs.readFileSync(APP_BASE_PATH + Constants.GAMES_DATA_BASE_PATH.slice(1)).toString());
};
const toggleFavourite = (GameID, LauncherName) => {
	const data = getGames();
	if (!data.Games) return;
	data.Games.find(x => x.GameID === GameID && x.LauncherName === LauncherName).Favourite = !data.Games.find(x => x.GameID === GameID && x.LauncherName === LauncherName).Favourite;

	setGames(data);
};
const addLaunch = (GameID, LauncherName) => {
	const data = getGames();
	if (!data.Games) return;
	data.Games.find(x => x.GameID === GameID && x.LauncherName === LauncherName).LastLaunch = Date.now();
	data.Games.find(x => x.GameID === GameID && x.LauncherName === LauncherName).Launches = typeof data.Games.find(x => x.GameID === GameID && x.LauncherName === LauncherName).Launches === 'number' ? data.Games.find(x => x.GameID === GameID && x.LauncherName === LauncherName).Launches + 1 : 1;
	console.log(data);
	setGames(data);
};

const handleLaunch = (game) => {
	let res;
	switch (game.LauncherName) {
	case 'EpicGames': {
		res = createProcess('start', [`com.epicgames.launcher://apps/${encodeURIComponent(game.LaunchID)}?action=launch`, '--wait'], game.GameID);
		break;
	}
	case 'Steam': {
		res = createProcess('start', [`steam://rungameid/${game.GameID}`, '--wait'], game.GameID);
		break;
	}
	case 'Uplay': {
		res = createProcess('start', [`uplay://launch/${game.GameID}/0`, '--wait'], game.GameID);
		break;
	}
	case 'Minecraft': {
		res = createProcess('minecraft-launcher', [], game.GameID);
		break;
	}
	default: {
		res = createProcess(`"${game.Location}/${game.Executable}"`, game.Args, game.GameID);
		break;
	}
	}

	if (res === 'RUNNING_ALREADY') {
		document.querySelector('.alert-box-message').textContent = `${game.DisplayName} is already running!`;
		document.querySelector('.alert-box').style.marginTop = '40px';
		document.querySelector('.alert-box').style.visibility = 'visible';
		document.querySelector('.alert-box').style.opacity = '1';
		return document.querySelector('.alert-box').style.display = 'flex';
	}

	addLaunch(game.GameID, game.LauncherName);
};

const createProcess = (Command, Args, GameID, force = false) => {
	if (processes.get(GameID) && !force) return 'RUNNING_ALREADY';

	const instance = spawn(Command, Args, { detached: true, shell: true });
	processes.set(GameID, instance);

	instance.on('spawn', () => console.log('[PROC] Process started with ID', GameID));
	instance.on('error', (error) => console.error('[PROC] Error on process', GameID, '\n', error));
	setTimeout(() => instance.on('exit', (code, signal) => {
		ipcRenderer.send('show-window');
		processes.delete(GameID);
		console.log('[PROC] Process', GameID, 'exited with code', code, 'and signal', signal);
	}), 100);

	return instance;
};

module.exports = {
	loadGames,
	getInstalledGames,
};
