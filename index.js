const { Client, LocalAuth } = require('whatsapp-web.js')
const qrcode = require('qrcode-terminal')
const fs = require('fs')

const botName = 'Freundlicher-Bot'

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

function isTopOwner(number) {
    return config.topowners.includes(number)
}

function isOwner(number) {
    return config.owners.includes(number) || isTopOwner(number)
}

function isLowOwner(number) {
    return config.lowowners.includes(number)
}

function hasAccess(number) {
    if (isTopOwner(number) || isOwner(number)) return true
    if (isLowOwner(number) && !config.lowownersGesperrt) return true
    return false
}

function hatLink(text) {
    const linkRegex = /(https?:\/\/|www\.|chat\.whatsapp\.com)[^\s]*/gi
    return linkRegex.test(text)
}

const lowOwnerBefehle = ['menu', 'info', 'pingms', 'save', 'sticker']

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
})

client.on('qr', (qr) => {
    // QR als Fallback anzeigen, falls Pairing nicht klappt
    qrcode.generate(qr, { small: true })
    console.log('QR-Code generiert (Fallback)')
})

client.on('code', (code) => {
    console.log(`🔑 Dein Pairing Code: ${code}`)
})

client.on('ready', () => {
    console.log(`✅ ${botName} ist verbunden!`)
})

client.on('message_create', async (msg) => {
    const contact = await msg.getContact()
    const nummer = contact.number

    let chat
    try {
        chat = await msg.getChat()
    } catch (error) {
        return
    }

    const gruppenId = chat.id._serialized

    if (chat.isGroup && config.antilinkGruppen.includes(gruppenId) && !hasAccess(nummer)) {
        if (hatLink(msg.body)) {
            try {
                await msg.delete(true)
                await chat.sendMessage(`⚠️ @${nummer} Links sind in dieser Gruppe nicht erlaubt!`, {
                    mentions: [await msg.getContact()]
                })
            } catch (error) {
                console.error(error)
            }
            return
        }
    }

    if (!msg.body.startsWith(config.prefix)) return
    if (!hasAccess(nummer)) return

    const befehl = msg.body.slice(config.prefix.length).split(' ')[0].toLowerCase()

    if (isLowOwner(nummer) && !isOwner(nummer) && !isTopOwner(nummer)) {
        if (!lowOwnerBefehle.includes(befehl)) {
            msg.reply(`❌ Du hast keinen Zugriff auf *${config.prefix}${befehl}*!`)
            return
        }
    }

    if (config.geblockteBefehle[nummer] && config.geblockteBefehle[nummer].includes(befehl)) {
        msg.reply(`❌ Du hast keinen Zugriff auf *${config.prefix}${befehl}*!`)
        return
    }

    if (befehl === 'closelowowners') {
        if (!isOwner(nummer) && !isTopOwner(nummer)) {
            msg.reply('❌ Nur Owner und Topowner können Lowowners sperren!')
            return
        }
        if (config.lowownersGesperrt) {
            msg.reply('ℹ️ Lowowners sind bereits gesperrt!')
            return
        }
        config.lowownersGesperrt = true
        saveConfig()
        msg.reply('🔒 Lowowners wurden gesperrt!')
    }

    if (befehl === 'openlowowners') {
        if (!isOwner(nummer) && !isTopOwner(nummer)) {
            msg.reply('❌ Nur Owner und Topowner können Lowowners entsperren!')
            return
        }
        if (!config.lowownersGesperrt) {
            msg.reply('ℹ️ Lowowners sind bereits entsperrt!')
            return
        }
        config.lowownersGesperrt = false
        saveConfig()
        msg.reply('🌿 Lowowners wurden entsperrt!')
    }

    if (befehl === 'hideowner') {
        if (!isTopOwner(nummer)) {
            msg.reply('❌ Nur Topowner können das!')
            return
        }
        config.ownerMenuVersteckt = true
        saveConfig()
        msg.reply('✅ Owner-Abschnitt wurde ausgeblendet!')
    }

    if (befehl === 'showowner') {
        if (!isTopOwner(nummer)) {
            msg.reply('❌ Nur Topowner können das!')
            return
        }
        config.ownerMenuVersteckt = false
        saveConfig()
        msg.reply('✅ Owner-Abschnitt wird wieder angezeigt!')
    }

    if (befehl === 'pin') {
        if (!chat.isGroup) {
            msg.reply('❌ Dieser Befehl funktioniert nur in Gruppen!')
            return
        }
        if (!msg.hasQuotedMsg) {
            msg.reply(`❌ Antworte auf eine Nachricht mit ${config.prefix}pin!`)
            return
        }
        try {
            const zitatNachricht = await msg.getQuotedMessage()
            await zitatNachricht.pin()
            msg.reply('📌 Nachricht wurde angepinnt!')
        } catch (error) {
            msg.reply('❌ Fehler! Bin ich Admin in dieser Gruppe?')
            console.error(error)
        }
    }

    if (befehl === 'boton') {
        if (config.deaktivierteGruppen.includes(gruppenId)) {
            config.deaktivierteGruppen = config.deaktivierteGruppen.filter(g => g !== gruppenId)
            saveConfig()
            msg.reply(`🌿 *${botName}* wurde in dieser Gruppe aktiviert!`)
        } else {
            msg.reply(`🌿 *${botName}* ist in dieser Gruppe bereits aktiv!`)
        }
        return
    }

    if (befehl === 'botoff') {
        if (!config.deaktivierteGruppen.includes(gruppenId)) {
            config.deaktivierteGruppen.push(gruppenId)
            saveConfig()
            msg.reply(`🔒 *${botName}* wurde in dieser Gruppe deaktiviert!`)
        } else {
            msg.reply(`🔒 *${botName}* ist in dieser Gruppe bereits deaktiviert!`)
        }
        return
    }

    if (config.deaktivierteGruppen.includes(gruppenId)) return

    if (befehl === 'addlowowner') {
        if (!isOwner(nummer) && !isTopOwner(nummer)) {
            msg.reply('❌ Nur Owner und Topowner können Lowowner hinzufügen!')
            return
        }
        const mentions = await msg.getMentions()
        if (mentions.length === 0) {
            msg.reply(`❌ Beispiel: ${config.prefix}addlowowner @name`)
            return
        }
        const neuerLowOwner = mentions[0].number
        if (config.lowowners.includes(neuerLowOwner)) {
            msg.reply('❌ Diese Person ist bereits Lowowner!')
            return
        }
        config.lowowners.push(neuerLowOwner)
        saveConfig()
        msg.reply(`✅ *${mentions[0].pushname || neuerLowOwner}* wurde als Lowowner hinzugefügt!`)
    }

    if (befehl === 'dellowowner') {
        if (!isOwner(nummer) && !isTopOwner(nummer)) {
            msg.reply('❌ Nur Owner und Topowner können Lowowner entfernen!')
            return
        }
        const mentions = await msg.getMentions()
        if (mentions.length === 0) {
            msg.reply(`❌ Beispiel: ${config.prefix}dellowowner @name`)
            return
        }
        const zuEntfernen = mentions[0].number
        if (!config.lowowners.includes(zuEntfernen)) {
            msg.reply('❌ Diese Person ist kein Lowowner!')
            return
        }
        config.lowowners = config.lowowners.filter(o => o !== zuEntfernen)
        saveConfig()
        msg.reply(`✅ *${mentions[0].pushname || zuEntfernen}* wurde als Lowowner entfernt!`)
    }

    if (befehl === 'lowownerlist') {
        if (config.lowowners.length === 0) {
            msg.reply('ℹ️ Keine Lowowner eingetragen!')
            return
        }
        msg.reply(`🌱 *Lowowner Liste:*\n\n${config.lowowners.map(o => `🌱 ${o}`).join('\n')}`)
    }

    if (befehl === 'menu') {
        let menu = `
🌸 *${botName}* 🌸

Willkommen! Hier sind alle Befehle 🌳

🌿 *Allgemein*
🍃 ${config.prefix}menu » Menü anzeigen
🍃 ${config.prefix}info » Bot Info anzeigen
🍃 ${config.prefix}pingMS » Verzögerung messen
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
        await msg.reply(menu.trim())
    }

    if (befehl === 'info') {
        const uptime = process.uptime()
        const stunden = Math.floor(uptime / 3600)
        const minuten = Math.floor((uptime % 3600) / 60)
        const sekunden = Math.floor(uptime % 60)
        const info = `
🌸 *${botName}* 🌸

🌿 *Bot Info*
🍃 Name » ${botName}
🍃 Prefix » ${config.prefix}
🍃 Topowner » ${config.topowners.length} eingetragen
🍃 Owner » ${config.owners.length} eingetragen
🍃 Lowowner » ${config.lowowners.length} eingetragen
🍃 Lowowners gesperrt » ${config.lowownersGesperrt ? 'Ja' : 'Nein'}
🍃 Laufzeit » ${stunden}h ${minuten}m ${sekunden}s
🍃 Version » 1.0.0

🌳🌸🌿🍃🌿🌸🌳
        `.trim()
        await msg.reply(info)
    }

    if (befehl === 'pingms') {
        const start = Date.now()
        await msg.reply('📡 Messe Verzögerung...')
        const ping = Date.now() - start
        await msg.reply(`⚡ Verzögerung: ${ping}ms`)
    }

    if (befehl === 'sticker') {
        const zitatNachricht = msg.hasQuotedMsg ? await msg.getQuotedMessage() : null
        if (!zitatNachricht) {
            msg.reply(`❌ Antworte auf ein Bild mit ${config.prefix}sticker!`)
            return
        }
        try {
            const media = await zitatNachricht.downloadMedia()
            if (!media) {
                msg.reply('❌ Konnte das Bild nicht herunterladen!')
                return
            }
            await chat.sendMessage(media, { sendMediaAsSticker: true })
            await msg.reply('🌿 Sticker erstellt!')
        } catch (error) {
            msg.reply('❌ Fehler beim Erstellen des Stickers!')
            console.error(error)
        }
    }

    if (befehl === 'save') {
        const zitatNachricht = msg.hasQuotedMsg ? await msg.getQuotedMessage() : null
        if (!zitatNachricht) {
            msg.reply(`❌ Antworte auf ein Bild oder Video mit ${config.prefix}save!`)
            return
        }
        try {
            const media = await zitatNachricht.downloadMedia()
            if (!media) {
                msg.reply('❌ Konnte das Bild nicht herunterladen!')
                return
            }
            if (!fs.existsSync('gespeichert')) {
                fs.mkdirSync('gespeichert')
            }
            const endung = media.mimetype.includes('video') ? 'mp4' : 'jpg'
            const dateiname = `gespeichert/${Date.now()}.${endung}`
            fs.writeFileSync(dateiname, Buffer.from(media.data, 'base64'))
            await msg.reply('🌿 Gespeichert!')
        } catch (error) {
            msg.reply('❌ Fehler beim Speichern!')
            console.error(error)
        }
    }

    if (befehl === 'antilink') {
        if (!chat.isGroup) {
            msg.reply('❌ Dieser Befehl funktioniert nur in Gruppen!')
            return
        }
        if (config.antilinkGruppen.includes(gruppenId)) {
            config.antilinkGruppen = config.antilinkGruppen.filter(g => g !== gruppenId)
            saveConfig()
            msg.reply('🌿 Antilink wurde *deaktiviert!*')
        } else {
            config.antilinkGruppen.push(gruppenId)
            saveConfig()
            msg.reply('🔒 Antilink wurde *aktiviert!*')
        }
    }

    if (befehl === 'kick') {
        if (!chat.isGroup) {
            msg.reply('❌ Dieser Befehl funktioniert nur in Gruppen!')
            return
        }
        const mentions = await msg.getMentions()
        if (mentions.length === 0) {
            msg.reply(`❌ Bitte markiere jemanden! Beispiel: ${config.prefix}kick @name`)
            return
        }
        try {
            await chat.removeParticipants([mentions[0].id._serialized])
            msg.reply(`🌿 *${mentions[0].pushname || mentions[0].number}* wurde entfernt!`)
        } catch (error) {
            msg.reply('❌ Fehler! Bin ich Admin in dieser Gruppe?')
            console.error(error)
        }
    }

    if (befehl === 'mute') {
        if (!chat.isGroup) {
            msg.reply('❌ Dieser Befehl funktioniert nur in Gruppen!')
            return
        }
        const mentions = await msg.getMentions()
        if (mentions.length === 0) {
            msg.reply(`❌ Bitte markiere jemanden! Beispiel: ${config.prefix}mute @name`)
            return
        }
        try {
            await chat.removeParticipants([mentions[0].id._serialized])
            await chat.addParticipants([mentions[0].id._serialized])
            msg.reply(`🔇 *${mentions[0].pushname || mentions[0].number}* wurde stummgeschaltet!`)
        } catch (error) {
            msg.reply('❌ Fehler! Bin ich Admin in dieser Gruppe?')
            console.error(error)
        }
    }

    if (befehl === 'open') {
        if (!chat.isGroup) {
            msg.reply('❌ Dieser Befehl funktioniert nur in Gruppen!')
            return
        }
        try {
            await chat.setMessagesAdminsOnly(false)
            msg.reply('🌿 Gruppe wurde geöffnet!')
        } catch (error) {
            msg.reply('❌ Fehler! Bin ich Admin in dieser Gruppe?')
            console.error(error)
        }
    }

    if (befehl === 'close') {
        if (!chat.isGroup) {
            msg.reply('❌ Dieser Befehl funktioniert nur in Gruppen!')
            return
        }
        try {
            await chat.setMessagesAdminsOnly(true)
            msg.reply('🔒 Gruppe wurde geschlossen!')
        } catch (error) {
            msg.reply('❌ Fehler! Bin ich Admin in dieser Gruppe?')
            console.error(error)
        }
    }

    if (befehl === 'addadmin') {
        if (!chat.isGroup) {
            msg.reply('❌ Dieser Befehl funktioniert nur in Gruppen!')
            return
        }
        const mentions = await msg.getMentions()
        if (mentions.length === 0) {
            msg.reply(`❌ Bitte markiere jemanden! Beispiel: ${config.prefix}addadmin @name`)
            return
        }
        try {
            await chat.promoteParticipants([mentions[0].id._serialized])
            msg.reply(`🌿 *${mentions[0].pushname || mentions[0].number}* ist jetzt Admin!`)
        } catch (error) {
            msg.reply('❌ Fehler! Bin ich Admin in dieser Gruppe?')
            console.error(error)
        }
    }

    if (befehl === 'deladmin') {
        if (!chat.isGroup) {
            msg.reply('❌ Dieser Befehl funktioniert nur in Gruppen!')
            return
        }
        const mentions = await msg.getMentions()
        if (mentions.length === 0) {
            msg.reply(`❌ Bitte markiere jemanden! Beispiel: ${config.prefix}deladmin @name`)
            return
        }
        try {
            await chat.demoteParticipants([mentions[0].id._serialized])
            msg.reply(`🌿 *${mentions[0].pushname || mentions[0].number}* ist kein Admin mehr!`)
        } catch (error) {
            msg.reply('❌ Fehler! Bin ich Admin in dieser Gruppe?')
            console.error(error)
        }
    }

    if (befehl === 'adminlist') {
        if (!chat.isGroup) {
            msg.reply('❌ Dieser Befehl funktioniert nur in Gruppen!')
            return
        }
        const admins = chat.participants.filter(p => p.isAdmin || p.isSuperAdmin)
        if (admins.length === 0) {
            msg.reply('ℹ️ Keine Admins gefunden!')
            return
        }
        const liste = admins.map(a => `🍃 ${a.id.user}`).join('\n')
        msg.reply(`🌿 *Adminliste*\n\n${liste}`)
    }

    if (befehl === 'setprefix') {
        const neuerPrefix = msg.body.split(' ')[1]
        if (!neuerPrefix) {
            msg.reply(`❌ Beispiel: ${config.prefix}setprefix .`)
            return
        }
        config.prefix = neuerPrefix
        saveConfig()
        msg.reply(`✅ Prefix wurde zu *${config.prefix}* geändert!`)
    }

    if (befehl === 'prefix') {
        msg.reply(`ℹ️ Aktueller Prefix: *${config.prefix}*`)
    }

    if (befehl === 'addowner') {
        if (!isTopOwner(nummer)) {
            msg.reply('❌ Nur Topowner können Owner hinzufügen!')
            return
        }
        const mentions = await msg.getMentions()
        if (mentions.length === 0) {
            msg.reply(`❌ Beispiel: ${config.prefix}addowner @name`)
            return
        }
        const neuerOwner = mentions[0].number
        if (config.owners.includes(neuerOwner)) {
            msg.reply('❌ Diese Person ist bereits Owner!')
            return
        }
        config.owners.push(neuerOwner)
        saveConfig()
        msg.reply(`✅ *${mentions[0].pushname || neuerOwner}* wurde als Owner hinzugefügt!`)
    }

    if (befehl === 'owners') {
        if (config.owners.length === 0 && config.topowners.length === 0) {
            msg.reply('ℹ️ Keine Owner eingetragen!')
            return
        }
        let antwort = ''
        if (config.topowners.length > 0) {
            antwort += `👑 *Topowner:*\n${config.topowners.map(o => `• ${o}`).join('\n')}\n\n`
        }
        if (config.owners.length > 0) {
            antwort += `🌿 *Owner:*\n${config.owners.map(o => `• ${o}`).join('\n')}\n\n`
        }
        if (config.lowowners.length > 0) {
            antwort += `🌱 *Lowowner:*\n${config.lowowners.map(o => `• ${o}`).join('\n')}`
        }
        msg.reply(antwort)
    }

    if (befehl === 'topownerlist') {
        if (config.topowners.length === 0) {
            msg.reply('ℹ️ Keine Topowner eingetragen!')
            return
        }
        msg.reply(`👑 *Topowner Liste:*\n\n${config.topowners.map(o => `👑 ${o}`).join('\n')}`)
    }

    if (befehl === 'addtopowner') {
        if (!isTopOwner(nummer)) {
            msg.reply('❌ Nur Topowner können andere Topowner hinzufügen!')
            return
        }
        const mentions = await msg.getMentions()
        if (mentions.length === 0) {
            msg.reply(`❌ Beispiel: ${config.prefix}addtopowner @name`)
            return
        }
        const neuerTopOwner = mentions[0].number
        if (config.topowners.includes(neuerTopOwner)) {
            msg.reply('❌ Diese Person ist bereits Topowner!')
            return
        }
        config.topowners.push(neuerTopOwner)
        saveConfig()
        msg.reply(`👑 *${mentions[0].pushname || neuerTopOwner}* wurde als Topowner hinzugefügt!`)
    }

    if (befehl === 'deltopowner') {
        if (!isTopOwner(nummer)) {
            msg.reply('❌ Nur Topowner können andere Topowner entfernen!')
            return
        }
        const mentions = await msg.getMentions()
        if (mentions.length === 0) {
            msg.reply(`❌ Beispiel: ${config.prefix}deltopowner @name`)
            return
        }
        const zuEntfernen = mentions[0].number
        if (!config.topowners.includes(zuEntfernen)) {
            msg.reply('❌ Diese Person ist kein Topowner!')
            return
        }
        config.topowners = config.topowners.filter(o => o !== zuEntfernen)
        saveConfig()
        msg.reply(`✅ *${mentions[0].pushname || zuEntfernen}* wurde als Topowner entfernt!`)
    }

    if (befehl === 'takeowner') {
        if (!isTopOwner(nummer)) {
            msg.reply('❌ Nur Topowner können Owner Rechte entziehen!')
            return
        }
        const mentions = await msg.getMentions()
        if (mentions.length === 0) {
            msg.reply(`❌ Beispiel: ${config.prefix}takeowner @name`)
            return
        }
        const zuEntfernen = mentions[0].number
        if (!config.owners.includes(zuEntfernen)) {
            msg.reply('❌ Diese Person ist kein Owner!')
            return
        }
        config.owners = config.owners.filter(o => o !== zuEntfernen)
        saveConfig()
        msg.reply(`✅ *${mentions[0].pushname || zuEntfernen}* wurden die Owner Rechte entzogen!`)
    }

    if (befehl === 'delcmd') {
        if (!isTopOwner(nummer)) {
            msg.reply('❌ Nur Topowner können Befehle sperren!')
            return
        }
        const mentions = await msg.getMentions()
        if (mentions.length === 0) {
            msg.reply(`❌ Beispiel: ${config.prefix}delcmd @name kick mute open`)
            return
        }
        const zielNummer = mentions[0].number
        if (isTopOwner(zielNummer)) {
            msg.reply('❌ Du kannst einem Topowner keine Befehle sperren!')
            return
        }
        const teile = msg.body.split(' ').slice(2)
        if (teile.length === 0) {
            msg.reply(`❌ Gib mindestens einen Befehl an!`)
            return
        }
        if (!config.geblockteBefehle[zielNummer]) {
            config.geblockteBefehle[zielNummer] = []
        }
        const neueBefehle = teile.filter(b => !config.geblockteBefehle[zielNummer].includes(b))
        config.geblockteBefehle[zielNummer].push(...neueBefehle)
        saveConfig()
        msg.reply(`✅ *${mentions[0].pushname || zielNummer}* kann diese Befehle nicht mehr nutzen:\n${teile.map(b => `🍃 ${config.prefix}${b}`).join('\n')}`)
    }

    if (befehl === 'addcmd') {
        if (!isTopOwner(nummer)) {
            msg.reply('❌ Nur Topowner können Befehle freischalten!')
            return
        }
        const mentions = await msg.getMentions()
        if (mentions.length === 0) {
            msg.reply(`❌ Beispiel: ${config.prefix}addcmd @name kick mute`)
            return
        }
        const zielNummer = mentions[0].number
        const teile = msg.body.split(' ').slice(2)
        if (teile.length === 0) {
            msg.reply(`❌ Gib mindestens einen Befehl an!`)
            return
        }
        if (!config.geblockteBefehle[zielNummer]) {
            msg.reply('ℹ️ Diese Person hat keine gesperrten Befehle!')
            return
        }
        config.geblockteBefehle[zielNummer] = config.geblockteBefehle[zielNummer].filter(b => !teile.includes(b))
        saveConfig()
        msg.reply(`✅ *${mentions[0].pushname || zielNummer}* kann diese Befehle wieder nutzen:\n${teile.map(b => `🍃 ${config.prefix}${b}`).join('\n')}`)
    }

    if (befehl === 'cmdlist') {
        const mentions = await msg.getMentions()
        const zielNummer = mentions.length > 0 ? mentions[0].number : nummer
        if (!config.geblockteBefehle[zielNummer] || config.geblockteBefehle[zielNummer].length === 0) {
            msg.reply('ℹ️ Diese Person hat keine gesperrten Befehle!')
            return
        }
        msg.reply(`🔒 *Gesperrte Befehle:*\n\n${config.geblockteBefehle[zielNummer].map(b => `🍃 ${config.prefix}${b}`).join('\n')}`)
    }
})

client.initialize()