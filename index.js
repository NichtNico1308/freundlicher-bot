const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeInMemoryStore,
    jidDecode,
    proto,
    getContentType
} = require('@whiskeysockets/baileys')
 
const fs = require('fs')
const P = require('pino')
 
const botName = 'Freundlicher-Bot'
 
// ─── Config ───────────────────────────────────────────────────────────────────
 
let config = {
    prefix: '!',
    topowners: [],
    owners: [],
    lowowners: [],
    deaktivierteGruppen: [],
    antilinkGruppen: [],
    geblockteBefehle: {},
    lowownersGesperrt: false,
    ownerMenuVersteckt: false
}
 
if (fs.existsSync('config.json')) {
    config = JSON.parse(fs.readFileSync('config.json'))
    if (!config.deaktivierteGruppen) config.deaktivierteGruppen = []
    if (!config.antilinkGruppen) config.antilinkGruppen = []
    if (!config.topowners) config.topowners = []
    if (!config.owners) config.owners = []
    if (!config.lowowners) config.lowowners = []
    if (!config.geblockteBefehle) config.geblockteBefehle = {}
    if (config.lowownersGesperrt === undefined) config.lowownersGesperrt = false
    if (config.ownerMenuVersteckt === undefined) config.ownerMenuVersteckt = false
}
 
function saveConfig() {
    fs.writeFileSync('config.json', JSON.stringify(config, null, 2))
}
 
// ─── Berechtigungen ───────────────────────────────────────────────────────────
 
function isTopOwner(number) { return config.topowners.includes(number) }
function isOwner(number) { return config.owners.includes(number) || isTopOwner(number) }
function isLowOwner(number) { return config.lowowners.includes(number) }
function hasAccess(number) {
    if (isTopOwner(number) || isOwner(number)) return true
    if (isLowOwner(number) && !config.lowownersGesperrt) return true
    return false
}
function hatLink(text) {
    return /(https?:\/\/|www\.|chat\.whatsapp\.com)[^\s]*/gi.test(text)
}
 
const lowOwnerBefehle = ['menu', 'info', 'pingms', 'save', 'sticker']
 
// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────
 
function getNumber(jid) {
    return jid ? jid.split('@')[0] : ''
}
 
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms))
}
 
// ─── Bot Start ────────────────────────────────────────────────────────────────
 
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info')
    const { version } = await fetchLatestBaileysVersion()
 
    const sock = makeWASocket({
        version,
        auth: state,
        logger: P({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['Freundlicher-Bot', 'Chrome', '1.0.0']
    })
 
    sock.ev.on('creds.update', saveCreds)
 
   sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
        console.log(`✅ ${botName} ist verbunden!`)
    } else if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
        if (shouldReconnect) startBot()
    }
})

if (!sock.authState.creds.registered) {
    await new Promise(r => setTimeout(r, 3000))
    const code = await sock.requestPairingCode('4916093491507')
    console.log(`🔑 Dein Pairing Code: ${code}`)
}
 
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return
 
        for (const msg of messages) {
            try {
                await handleMessage(sock, msg)
            } catch (err) {
                console.error('Fehler bei Nachricht:', err)
            }
        }
    })
}
 
// ─── Nachricht verarbeiten ────────────────────────────────────────────────────
 
async function handleMessage(sock, msg) {
    if (!msg.message) return
    if (msg.key.fromMe) return
 
    const from = msg.key.remoteJid
    const isGroup = from.endsWith('@g.us')
    const nummer = isGroup ? msg.key.participant?.split('@')[0] : from.split('@')[0]
    const gruppenId = from
 
    const contentType = getContentType(msg.message)
    const body =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption || ''
 
    // Anti-Link
    if (isGroup && config.antilinkGruppen.includes(gruppenId) && !hasAccess(nummer)) {
        if (hatLink(body)) {
            try {
                await sock.sendMessage(from, {
                    text: `⚠️ @${nummer} Links sind in dieser Gruppe nicht erlaubt!`,
                    mentions: [msg.key.participant]
                })
                await sock.sendMessage(from, { delete: msg.key })
            } catch (e) { console.error(e) }
            return
        }
    }
 
    if (!body.startsWith(config.prefix)) return
    if (!hasAccess(nummer)) return
 
    const befehl = body.slice(config.prefix.length).trim().split(' ')[0].toLowerCase()
    const args = body.trim().split(' ').slice(1)
 
    const reply = (text) => sock.sendMessage(from, { text }, { quoted: msg })
 
    // LowOwner Befehlscheck
    if (isLowOwner(nummer) && !isOwner(nummer) && !isTopOwner(nummer)) {
        if (!lowOwnerBefehle.includes(befehl)) {
            reply(`❌ Du hast keinen Zugriff auf *${config.prefix}${befehl}*!`)
            return
        }
    }
 
    // Gesperrte Befehle
    if (config.geblockteBefehle[nummer]?.includes(befehl)) {
        reply(`❌ Du hast keinen Zugriff auf *${config.prefix}${befehl}*!`)
        return
    }
 
    // ─── Befehle ──────────────────────────────────────────────────────────────
 
    if (befehl === 'menu') {
        let menu = `
🌸 *${botName}* 🌸
 
Willkommen! Hier sind alle Befehle 🌳
 
🌿 *Allgemein*
🍃 ${config.prefix}menu » Menü anzeigen
🍃 ${config.prefix}info » Bot Info anzeigen
🍃 ${config.prefix}pingms » Verzögerung messen
🍃 ${config.prefix}sticker » Bild zu Sticker
🍃 ${config.prefix}save » Bild/Video speichern`
 
        if (isOwner(nummer) || isTopOwner(nummer)) {
            menu += `
 
🌿 *Gruppen*
🍃 ${config.prefix}kick » Person kicken
🍃 ${config.prefix}mute » Person stummschalten
🍃 ${config.prefix}pin » Nachricht anpinnen
🍃 ${config.prefix}open » Gruppe öffnen
🍃 ${config.prefix}close » Gruppe schließen
🍃 ${config.prefix}boton » Bot aktivieren
🍃 ${config.prefix}botoff » Bot deaktivieren
🍃 ${config.prefix}addadmin » Admin machen
🍃 ${config.prefix}deladmin » Admin entfernen
🍃 ${config.prefix}adminlist » Adminliste anzeigen
🍃 ${config.prefix}antilink » Antilink an/aus
🍃 ${config.prefix}prefix » Prefix anzeigen
🍃 ${config.prefix}setprefix » Prefix ändern`
 
            if (!config.ownerMenuVersteckt) {
                menu += `
 
🌿 *Owner*
🍃 ${config.prefix}addowner » Owner hinzufügen
🍃 ${config.prefix}owners » Owner anzeigen
🍃 ${config.prefix}addlowowner » Lowowner hinzufügen
🍃 ${config.prefix}dellowowner » Lowowner entfernen
🍃 ${config.prefix}lowownerlist » Lowowner Liste
🍃 ${config.prefix}closelowowners » Lowowners sperren
🍃 ${config.prefix}openlowowners » Lowowners entsperren`
            }
        }
 
        if (isTopOwner(nummer)) {
            menu += `
 
🌿 *Topowner*
🍃 ${config.prefix}addtopowner » Topowner hinzufügen
🍃 ${config.prefix}deltopowner » Topowner entfernen
🍃 ${config.prefix}topownerlist » Topowner Liste
🍃 ${config.prefix}takeowner » Owner Rechte entziehen
🍃 ${config.prefix}delcmd » Befehle sperren
🍃 ${config.prefix}addcmd » Befehle freischalten
🍃 ${config.prefix}cmdlist » Gesperrte Befehle
🍃 ${config.prefix}hideowner » Owner-Abschnitt ausblenden
🍃 ${config.prefix}showowner » Owner-Abschnitt einblenden`
        }
 
        menu += `\n\n🌿🍃🌳🍃🌿`
        await reply(menu.trim())
    }
 
    else if (befehl === 'info') {
        const uptime = process.uptime()
        const stunden = Math.floor(uptime / 3600)
        const minuten = Math.floor((uptime % 3600) / 60)
        const sekunden = Math.floor(uptime % 60)
        await reply(`
🌸 *${botName}* 🌸
 
🌿 *Bot Info*
🍃 Name » ${botName}
🍃 Prefix » ${config.prefix}
🍃 Topowner » ${config.topowners.length} eingetragen
🍃 Owner » ${config.owners.length} eingetragen
🍃 Lowowner » ${config.lowowners.length} eingetragen
🍃 Lowowners gesperrt » ${config.lowownersGesperrt ? 'Ja' : 'Nein'}
🍃 Laufzeit » ${stunden}h ${minuten}m ${sekunden}s
🍃 Version » 2.0.0 (Baileys)
 
🌳🌸🌿🍃🌿🌸🌳`.trim())
    }
 
    else if (befehl === 'pingms') {
        const start = Date.now()
        await reply('📡 Messe Verzögerung...')
        await reply(`⚡ Verzögerung: ${Date.now() - start}ms`)
    }
 
    else if (befehl === 'prefix') {
        await reply(`ℹ️ Aktueller Prefix: *${config.prefix}*`)
    }
 
    else if (befehl === 'setprefix') {
        if (!args[0]) return reply(`❌ Beispiel: ${config.prefix}setprefix .`)
        config.prefix = args[0]
        saveConfig()
        await reply(`✅ Prefix wurde zu *${config.prefix}* geändert!`)
    }
 
    else if (befehl === 'boton') {
        if (config.deaktivierteGruppen.includes(gruppenId)) {
            config.deaktivierteGruppen = config.deaktivierteGruppen.filter(g => g !== gruppenId)
            saveConfig()
            await reply(`🌿 *${botName}* wurde in dieser Gruppe aktiviert!`)
        } else {
            await reply(`🌿 *${botName}* ist in dieser Gruppe bereits aktiv!`)
        }
    }
 
    else if (befehl === 'botoff') {
        if (!config.deaktivierteGruppen.includes(gruppenId)) {
            config.deaktivierteGruppen.push(gruppenId)
            saveConfig()
            await reply(`🔒 *${botName}* wurde in dieser Gruppe deaktiviert!`)
        } else {
            await reply(`🔒 *${botName}* ist in dieser Gruppe bereits deaktiviert!`)
        }
    }
 
    else if (befehl === 'antilink') {
        if (!isGroup) return reply('❌ Dieser Befehl funktioniert nur in Gruppen!')
        if (config.antilinkGruppen.includes(gruppenId)) {
            config.antilinkGruppen = config.antilinkGruppen.filter(g => g !== gruppenId)
            saveConfig()
            await reply('🌿 Antilink wurde *deaktiviert!*')
        } else {
            config.antilinkGruppen.push(gruppenId)
            saveConfig()
            await reply('🔒 Antilink wurde *aktiviert!*')
        }
    }
 
    else if (befehl === 'closelowowners') {
        if (!isOwner(nummer) && !isTopOwner(nummer)) return reply('❌ Nur Owner und Topowner können Lowowners sperren!')
        if (config.lowownersGesperrt) return reply('ℹ️ Lowowners sind bereits gesperrt!')
        config.lowownersGesperrt = true
        saveConfig()
        await reply('🔒 Lowowners wurden gesperrt!')
    }
 
    else if (befehl === 'openlowowners') {
        if (!isOwner(nummer) && !isTopOwner(nummer)) return reply('❌ Nur Owner und Topowner können Lowowners entsperren!')
        if (!config.lowownersGesperrt) return reply('ℹ️ Lowowners sind bereits entsperrt!')
        config.lowownersGesperrt = false
        saveConfig()
        await reply('🌿 Lowowners wurden entsperrt!')
    }
 
    else if (befehl === 'hideowner') {
        if (!isTopOwner(nummer)) return reply('❌ Nur Topowner können das!')
        config.ownerMenuVersteckt = true
        saveConfig()
        await reply('✅ Owner-Abschnitt wurde ausgeblendet!')
    }
 
    else if (befehl === 'showowner') {
        if (!isTopOwner(nummer)) return reply('❌ Nur Topowner können das!')
        config.ownerMenuVersteckt = false
        saveConfig()
        await reply('✅ Owner-Abschnitt wird wieder angezeigt!')
    }
 
    else if (befehl === 'addowner') {
        if (!isTopOwner(nummer)) return reply('❌ Nur Topowner können Owner hinzufügen!')
        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
        if (mentions.length === 0) return reply(`❌ Beispiel: ${config.prefix}addowner @name`)
        const neuerOwner = getNumber(mentions[0])
        if (config.owners.includes(neuerOwner)) return reply('❌ Diese Person ist bereits Owner!')
        config.owners.push(neuerOwner)
        saveConfig()
        await reply(`✅ *${neuerOwner}* wurde als Owner hinzugefügt!`)
    }
 
    else if (befehl === 'owners') {
        let antwort = ''
        if (config.topowners.length > 0) antwort += `👑 *Topowner:*\n${config.topowners.map(o => `• ${o}`).join('\n')}\n\n`
        if (config.owners.length > 0) antwort += `🌿 *Owner:*\n${config.owners.map(o => `• ${o}`).join('\n')}\n\n`
        if (config.lowowners.length > 0) antwort += `🌱 *Lowowner:*\n${config.lowowners.map(o => `• ${o}`).join('\n')}`
        await reply(antwort || 'ℹ️ Keine Owner eingetragen!')
    }
 
    else if (befehl === 'addlowowner') {
        if (!isOwner(nummer) && !isTopOwner(nummer)) return reply('❌ Nur Owner und Topowner können Lowowner hinzufügen!')
        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
        if (mentions.length === 0) return reply(`❌ Beispiel: ${config.prefix}addlowowner @name`)
        const neuerLowOwner = getNumber(mentions[0])
        if (config.lowowners.includes(neuerLowOwner)) return reply('❌ Diese Person ist bereits Lowowner!')
        config.lowowners.push(neuerLowOwner)
        saveConfig()
        await reply(`✅ *${neuerLowOwner}* wurde als Lowowner hinzugefügt!`)
    }
 
    else if (befehl === 'dellowowner') {
        if (!isOwner(nummer) && !isTopOwner(nummer)) return reply('❌ Nur Owner und Topowner können Lowowner entfernen!')
        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
        if (mentions.length === 0) return reply(`❌ Beispiel: ${config.prefix}dellowowner @name`)
        const zuEntfernen = getNumber(mentions[0])
        if (!config.lowowners.includes(zuEntfernen)) return reply('❌ Diese Person ist kein Lowowner!')
        config.lowowners = config.lowowners.filter(o => o !== zuEntfernen)
        saveConfig()
        await reply(`✅ *${zuEntfernen}* wurde als Lowowner entfernt!`)
    }
 
    else if (befehl === 'lowownerlist') {
        if (config.lowowners.length === 0) return reply('ℹ️ Keine Lowowner eingetragen!')
        await reply(`🌱 *Lowowner Liste:*\n\n${config.lowowners.map(o => `🌱 ${o}`).join('\n')}`)
    }
 
    else if (befehl === 'addtopowner') {
        if (!isTopOwner(nummer)) return reply('❌ Nur Topowner können andere Topowner hinzufügen!')
        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
        if (mentions.length === 0) return reply(`❌ Beispiel: ${config.prefix}addtopowner @name`)
        const neuerTopOwner = getNumber(mentions[0])
        if (config.topowners.includes(neuerTopOwner)) return reply('❌ Diese Person ist bereits Topowner!')
        config.topowners.push(neuerTopOwner)
        saveConfig()
        await reply(`👑 *${neuerTopOwner}* wurde als Topowner hinzugefügt!`)
    }
 
    else if (befehl === 'deltopowner') {
        if (!isTopOwner(nummer)) return reply('❌ Nur Topowner können andere Topowner entfernen!')
        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
        if (mentions.length === 0) return reply(`❌ Beispiel: ${config.prefix}deltopowner @name`)
        const zuEntfernen = getNumber(mentions[0])
        if (!config.topowners.includes(zuEntfernen)) return reply('❌ Diese Person ist kein Topowner!')
        config.topowners = config.topowners.filter(o => o !== zuEntfernen)
        saveConfig()
        await reply(`✅ *${zuEntfernen}* wurde als Topowner entfernt!`)
    }
 
    else if (befehl === 'topownerlist') {
        if (config.topowners.length === 0) return reply('ℹ️ Keine Topowner eingetragen!')
        await reply(`👑 *Topowner Liste:*\n\n${config.topowners.map(o => `👑 ${o}`).join('\n')}`)
    }
 
    else if (befehl === 'takeowner') {
        if (!isTopOwner(nummer)) return reply('❌ Nur Topowner können Owner Rechte entziehen!')
        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
        if (mentions.length === 0) return reply(`❌ Beispiel: ${config.prefix}takeowner @name`)
        const zuEntfernen = getNumber(mentions[0])
        if (!config.owners.includes(zuEntfernen)) return reply('❌ Diese Person ist kein Owner!')
        config.owners = config.owners.filter(o => o !== zuEntfernen)
        saveConfig()
        await reply(`✅ *${zuEntfernen}* wurden die Owner Rechte entzogen!`)
    }
 
    else if (befehl === 'delcmd') {
        if (!isTopOwner(nummer)) return reply('❌ Nur Topowner können Befehle sperren!')
        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
        if (mentions.length === 0) return reply(`❌ Beispiel: ${config.prefix}delcmd @name kick mute`)
        const zielNummer = getNumber(mentions[0])
        if (isTopOwner(zielNummer)) return reply('❌ Du kannst einem Topowner keine Befehle sperren!')
        const befehle = args.filter(a => !a.startsWith('@'))
        if (befehle.length === 0) return reply('❌ Gib mindestens einen Befehl an!')
        if (!config.geblockteBefehle[zielNummer]) config.geblockteBefehle[zielNummer] = []
        const neu = befehle.filter(b => !config.geblockteBefehle[zielNummer].includes(b))
        config.geblockteBefehle[zielNummer].push(...neu)
        saveConfig()
        await reply(`✅ *${zielNummer}* kann diese Befehle nicht mehr nutzen:\n${befehle.map(b => `🍃 ${config.prefix}${b}`).join('\n')}`)
    }
 
    else if (befehl === 'addcmd') {
        if (!isTopOwner(nummer)) return reply('❌ Nur Topowner können Befehle freischalten!')
        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
        if (mentions.length === 0) return reply(`❌ Beispiel: ${config.prefix}addcmd @name kick mute`)
        const zielNummer = getNumber(mentions[0])
        const befehle = args.filter(a => !a.startsWith('@'))
        if (befehle.length === 0) return reply('❌ Gib mindestens einen Befehl an!')
        if (!config.geblockteBefehle[zielNummer]) return reply('ℹ️ Diese Person hat keine gesperrten Befehle!')
        config.geblockteBefehle[zielNummer] = config.geblockteBefehle[zielNummer].filter(b => !befehle.includes(b))
        saveConfig()
        await reply(`✅ *${zielNummer}* kann diese Befehle wieder nutzen:\n${befehle.map(b => `🍃 ${config.prefix}${b}`).join('\n')}`)
    }
 
    else if (befehl === 'cmdlist') {
        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
        const zielNummer = mentions.length > 0 ? getNumber(mentions[0]) : nummer
        if (!config.geblockteBefehle[zielNummer]?.length) return reply('ℹ️ Diese Person hat keine gesperrten Befehle!')
        await reply(`🔒 *Gesperrte Befehle:*\n\n${config.geblockteBefehle[zielNummer].map(b => `🍃 ${config.prefix}${b}`).join('\n')}`)
    }
 
    else if (befehl === 'kick') {
        if (!isGroup) return reply('❌ Dieser Befehl funktioniert nur in Gruppen!')
        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
        if (mentions.length === 0) return reply(`❌ Bitte markiere jemanden! Beispiel: ${config.prefix}kick @name`)
        try {
            await sock.groupParticipantsUpdate(from, [mentions[0]], 'remove')
            await reply(`🌿 *${getNumber(mentions[0])}* wurde entfernt!`)
        } catch (e) {
            await reply('❌ Fehler! Bin ich Admin in dieser Gruppe?')
        }
    }
 
    else if (befehl === 'addadmin') {
        if (!isGroup) return reply('❌ Dieser Befehl funktioniert nur in Gruppen!')
        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
        if (mentions.length === 0) return reply(`❌ Bitte markiere jemanden! Beispiel: ${config.prefix}addadmin @name`)
        try {
            await sock.groupParticipantsUpdate(from, [mentions[0]], 'promote')
            await reply(`🌿 *${getNumber(mentions[0])}* ist jetzt Admin!`)
        } catch (e) {
            await reply('❌ Fehler! Bin ich Admin in dieser Gruppe?')
        }
    }
 
    else if (befehl === 'deladmin') {
        if (!isGroup) return reply('❌ Dieser Befehl funktioniert nur in Gruppen!')
        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
        if (mentions.length === 0) return reply(`❌ Bitte markiere jemanden! Beispiel: ${config.prefix}deladmin @name`)
        try {
            await sock.groupParticipantsUpdate(from, [mentions[0]], 'demote')
            await reply(`🌿 *${getNumber(mentions[0])}* ist kein Admin mehr!`)
        } catch (e) {
            await reply('❌ Fehler! Bin ich Admin in dieser Gruppe?')
        }
    }
 
    else if (befehl === 'adminlist') {
        if (!isGroup) return reply('❌ Dieser Befehl funktioniert nur in Gruppen!')
        try {
            const meta = await sock.groupMetadata(from)
            const admins = meta.participants.filter(p => p.admin)
            if (admins.length === 0) return reply('ℹ️ Keine Admins gefunden!')
            await reply(`🌿 *Adminliste*\n\n${admins.map(a => `🍃 ${getNumber(a.id)}`).join('\n')}`)
        } catch (e) {
            await reply('❌ Fehler beim Abrufen der Adminliste!')
        }
    }
 
    else if (befehl === 'open') {
        if (!isGroup) return reply('❌ Dieser Befehl funktioniert nur in Gruppen!')
        try {
            await sock.groupSettingUpdate(from, 'not_announcement')
            await reply('🌿 Gruppe wurde geöffnet!')
        } catch (e) {
            await reply('❌ Fehler! Bin ich Admin in dieser Gruppe?')
        }
    }
 
    else if (befehl === 'close') {
        if (!isGroup) return reply('❌ Dieser Befehl funktioniert nur in Gruppen!')
        try {
            await sock.groupSettingUpdate(from, 'announcement')
            await reply('🔒 Gruppe wurde geschlossen!')
        } catch (e) {
            await reply('❌ Fehler! Bin ich Admin in dieser Gruppe?')
        }
    }
 
    else if (befehl === 'sticker') {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        if (!quoted) return reply(`❌ Antworte auf ein Bild mit ${config.prefix}sticker!`)
        try {
            const imgMsg = quoted.imageMessage || quoted.videoMessage
            if (!imgMsg) return reply('❌ Kein Bild/Video gefunden!')
            const stream = await sock.downloadContentFromMessage(imgMsg, imgMsg === quoted.imageMessage ? 'image' : 'video')
            let buffer = Buffer.alloc(0)
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk])
            await sock.sendMessage(from, { sticker: buffer }, { quoted: msg })
        } catch (e) {
            await reply('❌ Fehler beim Erstellen des Stickers!')
            console.error(e)
        }
    }
 
    else if (befehl === 'save') {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        if (!quoted) return reply(`❌ Antworte auf ein Bild oder Video mit ${config.prefix}save!`)
        try {
            const imgMsg = quoted.imageMessage || quoted.videoMessage
            if (!imgMsg) return reply('❌ Kein Bild/Video gefunden!')
            const isVideo = !!quoted.videoMessage
            const stream = await sock.downloadContentFromMessage(imgMsg, isVideo ? 'video' : 'image')
            let buffer = Buffer.alloc(0)
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk])
            if (!fs.existsSync('gespeichert')) fs.mkdirSync('gespeichert')
            const dateiname = `gespeichert/${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`
            fs.writeFileSync(dateiname, buffer)
            await reply('🌿 Gespeichert!')
        } catch (e) {
            await reply('❌ Fehler beim Speichern!')
            console.error(e)
        }
    }
}
 
startBot()
