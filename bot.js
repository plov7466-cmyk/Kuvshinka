const path = require('path');
const dotenv = require('dotenv');
const express = require('express');

dotenv.config({
    path: path.join(__dirname, '.env'),
    override: true
});

const {
    Client, GatewayIntentBits, ChannelType, ActionRowBuilder, ButtonBuilder,
    ButtonStyle, StringSelectMenuBuilder, MessageFlags, EmbedBuilder, Options,
    ContainerBuilder, TextDisplayBuilder, SectionBuilder, SeparatorBuilder,
    MediaGalleryBuilder, MediaGalleryItemBuilder, ThumbnailBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');

const { DiscordVCStatus } = require('discord-vc-status');

const stats = require('./stats');
const config = require('./config');

// =========================
// 🌐 HTTP-СЕРВЕР
// =========================
const app = express();
const PORT = process.env.PORT || 8000;
app.get('/', (req, res) => res.send('Кувшинка онлайн'));
app.listen(PORT, () => console.log(`HTTP-сервер запущен на порту ${PORT}`));

// =========================
// 🐸 КЛИЕНТ
// =========================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildEmojisAndStickers
    ],

    makeCache: Options.cacheWithLimits({
        ...Options.DefaultMakeCacheSettings,
        MessageManager: 0,
        PresenceManager: 0,
        GuildMemberManager: 100,
        UserManager: 100,
        GuildStickerManager: 0,
        GuildEmojiManager: 0,
        GuildScheduledEventManager: 0,
        ReactionManager: 0,
        StageInstanceManager: 0,
        ThreadManager: 0
    }),

    sweepers: {
        messages: { interval: 300, lifetime: 60 },
        users:    { interval: 300, filter: () => (u) => u.bot && u.id !== client.user.id },
        guildMembers: { interval: 300, filter: () => (m) => !m.voice.channelId }
    }
});

client.vcStatus = new DiscordVCStatus(client);

// =========================
// 🆕 ЗАГЛУШКИ ФУНКЦИЙ (эволюция / рейтинг)
// =========================
const DISABLED_MESSAGE = '🌾 **Временно недоступно.** Эта функция сейчас на профилактике в Пруду — загляни позже. 🐸';

// заглушка эволюции: больше не вызывает stats-функции
async function checkMemberEvolution(member) {
    // отключено: ничего не делаем, чтобы не нагружать stats
    return;
}

// заглушка полной синхронизации (если fullSync где-то импортировался)
async function fullSync() {
    return;
}

// =========================
// 🐸 НАСТРОЙКИ
// =========================
const RULES_CHANNEL_ID = '1510063400535851198';
const WELCOME_CHANNEL_ID = '1510063211099983902';
const CREATE_ROOM_CHANNEL_ID = '1518746457988010045';
const ROOM_SUFFIX = "'s Лужа";
const ROOM_IMAGE_URL = 'https://i.postimg.cc/4d1g8Rq8/photo-2026-10-11-00-45-20.jpg';
const FROG_IMAGE_URL = 'https://i.postimg.cc/6pWhkxdj/Milyj-lagusonok-sredi-kuvsinok.png';

// =========================
// 🎨 ID КАСТОМНЫХ ЭМОДЗИ
// =========================
const EMOJI_SETTINGS = '1561708488990785556';
const EMOJI_PENCIL   = '1561708531122446356';
const EMOJI_SPEECH   = '1561708575154376734';
const EMOJI_FROGS    = '1561711882027663370';
const EMOJI_LOCK     = '1561708661473280020';
const EMOJI_UNLOCK   = '1561708698257203280';
const EMOJI_GLOBE    = '1561708784852668496';
const EMOJI_TRANSFER = '1561711719858966718';
const EMOJI_TRASH    = '1561711760548040764';

function emojiFor(id) {
    let e = client.emojis.cache.get(id);
    if (!e) {
        for (const guild of client.guilds.cache.values()) {
            e = guild.emojis.cache.get(id);
            if (e) break;
        }
    }
    return e ? `<:${e.name}:${e.id}>` : '';
}

function eSettings() { return emojiFor(EMOJI_SETTINGS); }
function ePencil()   { return emojiFor(EMOJI_PENCIL); }
function eSpeech()   { return emojiFor(EMOJI_SPEECH); }
function eFrogs()    { return emojiFor(EMOJI_FROGS); }
function eLock()     { return emojiFor(EMOJI_LOCK); }
function eUnlock()   { return emojiFor(EMOJI_UNLOCK); }
function eGlobe()    { return emojiFor(EMOJI_GLOBE); }
function eTransfer() { return emojiFor(EMOJI_TRANSFER); }
function eTrash()    { return emojiFor(EMOJI_TRASH); }

const roomOwners = new Map();

function setRoomOwner(channelId, ownerId) {
    roomOwners.set(channelId, ownerId);
    stats.setRoomOwner(channelId, ownerId);
}

function removeRoomOwner(channelId) {
    roomOwners.delete(channelId);
    stats.removeRoom(channelId);
}

function isRoom(channelId) {
    return roomOwners.has(channelId);
}

for (const [channelId, ownerId] of Object.entries(stats.getRooms())) {
    roomOwners.set(channelId, ownerId);
}

const REGIONS = [
    { label: 'Автоматический выбор', value: 'auto' },
    { label: 'Brazil',               value: 'brazil' },
    { label: 'Hong Kong',            value: 'hongkong' },
    { label: 'India',                value: 'india' },
    { label: 'Japan',                value: 'japan' },
    { label: 'Rotterdam',            value: 'rotterdam' },
    { label: 'Singapore',            value: 'singapore' },
    { label: 'South Africa',         value: 'southafrica' },
    { label: 'Sydney',               value: 'sydney' },
    { label: 'US Central',           value: 'us-central' },
    { label: 'US East',              value: 'us-east' },
    { label: 'US South',             value: 'us-south' },
    { label: 'US West',              value: 'us-west' }
];

// =========================
// 🐸 ЗАПУСК
// =========================
client.once('clientReady', async () => {
    console.log(`Кувшинка запущена как ${client.user.tag}`);
    logMemory('при запуске');

    for (const guild of client.guilds.cache.values()) {
        await guild.emojis.fetch().catch(() => {});
    }

    await cleanupStaleRooms();
    await checkCreateRoomOnStartup();

    setInterval(() => logMemory('периодическая проверка'), 10 * 60 * 1000);

    // 🆕 синхронизация отключена (fullSync — заглушка)
    const FULL_SYNC_MS = (config.FULL_SYNC_INTERVAL_MINUTES || 360) * 60 * 1000;
    setInterval(() => fullSync(client), FULL_SYNC_MS);
    setTimeout(() => fullSync(client), 15_000);

    const commands = [
        { name: 'top', description: 'Рейтинг активности в Пруду' },
        { name: 'evolve', description: 'Проверить свой прогресс эволюции' },
        { name: 'panel', description: 'Вызвать панель управления лужей' }
    ];

    for (const guild of client.guilds.cache.values()) {
        guild.commands.set(commands)
            .then(() => console.log(`🏠 Слеш-команды зарегистрированы для гильдии ${guild.name}`))
            .catch(err => console.error(`Ошибка регистрации команд для ${guild.name}:`, err));
    }

    client.application.commands.set([])
        .then(() => console.log('🧹 Старые глобальные команды очищены'))
        .catch(() => {});
});

function logMemory(label = '') {
    const used = process.memoryUsage();
    const mb = (b) => (b / 1024 / 1024).toFixed(2);
    console.log(`📊 [${label}] RSS: ${mb(used.rss)} MB | Heap: ${mb(used.heapUsed)}/${mb(used.heapTotal)} MB`);
}

async function cleanupStaleRooms() {
    let removed = 0;
    for (const guild of client.guilds.cache.values()) {
        const channels = await guild.channels.fetch().catch(() => null);
        if (!channels) continue;

        const validIds = new Set();
        for (const ch of channels.values()) {
            if (ch && ch.type === ChannelType.GuildVoice && roomOwners.has(ch.id)) {
                validIds.add(ch.id);
            }
        }

        for (const channelId of [...roomOwners.keys()]) {
            if (!channels.has(channelId) || !validIds.has(channelId)) {
                removeRoomOwner(channelId);
                removed++;
            }
        }
    }
    if (removed > 0) {
        console.log(`🧹 Удалено устаревших записей о лужах: ${removed}`);
    }
}

// =========================
// 🆕 СОЗДАНИЕ ЛУЖИ
// =========================
async function createRoomForMember(member, guild) {
    try {
        const existingOwned = [...roomOwners.entries()].find(([, owner]) => owner === member.id);

        if (existingOwned) {
            const existingChannel = guild.channels.cache.get(existingOwned[0])
                || await guild.channels.fetch(existingOwned[0]).catch(() => null);

            if (existingChannel && existingChannel.type === ChannelType.GuildVoice) {
                if (existingChannel.members.size === 0) {
                    console.log(`🔄 Перекидываю ${member.user.tag} в существующую лужу.`);
                    await member.voice.setChannel(existingChannel).catch(() => {});
                    return;
                }
            } else {
                removeRoomOwner(existingOwned[0]);
            }
        }

        const createChannel = guild.channels.cache.get(CREATE_ROOM_CHANNEL_ID)
            || await guild.channels.fetch(CREATE_ROOM_CHANNEL_ID).catch(() => null);

        const room = await guild.channels.create({
            name: `${member.displayName}${ROOM_SUFFIX}`,
            type: ChannelType.GuildVoice,
            parent: createChannel ? createChannel.parentId : null
        });

        await room.lockPermissions().catch(() => {});

        await room.permissionOverwrites.edit(member.id, {
            ManageChannels: true,
            MoveMembers: true
        }).catch(() => {});

        setRoomOwner(room.id, member.id);

        try {
            const container = buildControlPanelV2(member, room.id);
            await room.send({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });
        } catch (e) {
            console.error('❌ Ошибка отправки панели:', e);
        }

        await member.voice.setChannel(room).catch(() => {});
        console.log(`✅ Создана лужа для ${member.user.tag}`);
    } catch (e) {
        console.error(`Ошибка создания лужи для ${member.user.tag}:`, e);
    }
}

// =========================
// 🆕 ПРОВЕРКА ПРИ ЗАПУСКЕ
// =========================
async function checkCreateRoomOnStartup() {
    console.log('🔍 Проверяем канал создания луж при запуске...');

    for (const guild of client.guilds.cache.values()) {
        const createChannel = guild.channels.cache.get(CREATE_ROOM_CHANNEL_ID)
            || await guild.channels.fetch(CREATE_ROOM_CHANNEL_ID).catch(() => null);

        if (!createChannel || createChannel.type !== ChannelType.GuildVoice) continue;

        if (createChannel.members.size > 0) {
            for (const member of createChannel.members.values()) {
                if (member.user.bot) continue;
                await createRoomForMember(member, guild);
            }
        }
    }
    console.log('✅ Проверка канала создания завершена.');
}

// =========================
// 👋 ПРИВЕТСТВИЕ
// =========================
client.on('guildMemberAdd', async (member) => {
    try {
        const welcomeChannel = await member.guild.channels
            .fetch(WELCOME_CHANNEL_ID).catch(() => null);
        if (!welcomeChannel) return console.error('Welcome-канал не найден!');

        await welcomeChannel.send(
            `🐸 Добро пожаловать в Пруд, ${member}!\n\n` +
            `🌿 Рады видеть тебя среди наших обитателей.\n` +
            `Пожалуйста, ознакомься с Болотным кодексом в <#${RULES_CHANNEL_ID}>.\n\n` +
            `Приятного плавания! 🌺`
        );
    } catch (e) {
        console.error('Ошибка приветствия:', e);
    }
});

// =========================
// 🔧 ПАНЕЛЬ (Components V2)
// =========================
function buildControlPanelV2(member, roomId) {
    const container = new ContainerBuilder()
        .setAccentColor(0x2E8B57);

    container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder()
                .setURL(ROOM_IMAGE_URL)
                .setDescription('Личная лужа')
        )
    );

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# 🌺 Твоя личная лужа\n\n` +
            `Это твоя личная лужа, ${member}!\n` +
            `Используй кнопки для управления.`
        )
    );

    container.addSeparatorComponents(new SeparatorBuilder());

    const actions = [
        { id: 'info',     label: 'Просмотреть настройки лужи', emojiId: EMOJI_SETTINGS, style: ButtonStyle.Secondary },
        { id: 'name',     label: 'Переименовать лужу',         emojiId: EMOJI_PENCIL,   style: ButtonStyle.Secondary },
        { id: 'status',   label: 'Изменить статус лужи',        emojiId: EMOJI_SPEECH,   style: ButtonStyle.Secondary },
        { id: 'limit',    label: 'Изменить лимит лягушек',      emojiId: EMOJI_FROGS,    style: ButtonStyle.Secondary },
        { id: 'lock',     label: 'Закрыть лужу для чужих',      emojiId: EMOJI_LOCK,     style: ButtonStyle.Secondary },
        { id: 'unlock',   label: 'Открыть лужу для всех',       emojiId: EMOJI_UNLOCK,   style: ButtonStyle.Secondary },
        { id: 'region',   label: 'Сменить место обитания',      emojiId: EMOJI_GLOBE,    style: ButtonStyle.Secondary },
        { id: 'transfer', label: 'Передать лужу другому',       emojiId: EMOJI_TRANSFER, style: ButtonStyle.Secondary },
        { id: 'delete',   label: 'Высушить лужу',               emojiId: EMOJI_TRASH,    style: ButtonStyle.Secondary }
    ];

    for (const action of actions) {
        const btn = new ButtonBuilder()
            .setCustomId(`${action.id}_${roomId}`)
            .setStyle(action.style)
            .setEmoji({ id: action.emojiId });

        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(action.label)
                )
                .setButtonAccessory(btn)
        );
    }

    container.addSeparatorComponents(new SeparatorBuilder());

    const frogThumbnail = new ThumbnailBuilder()
        .setURL(FROG_IMAGE_URL)
        .setDescription('Лягушонок');

    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `*Используй команду \`/panel\` для повторного вызова этого меню*`
                )
            )
            .setThumbnailAccessory(frogThumbnail)
    );

    return container;
}

// =========================
// 🔄 ПЕРЕДАЧА ВЛАДЕНИЯ
// =========================
async function transferOwnership(channel, oldId, newId, auto = false) {
    try {
        if (oldId) {
            await channel.permissionOverwrites.edit(oldId, {
                ManageChannels: false, MoveMembers: false, ViewChannel: true, Connect: true
            }).catch(() => {});
        }
        await channel.permissionOverwrites.edit(newId, { ManageChannels: true, MoveMembers: true });
        setRoomOwner(channel.id, newId);

        await refreshPanel(channel, newId);

        await channel.send(auto
            ? `${eTransfer()} Владелец покинул лужу. Владение автоматически передано <@${newId}>.`
            : `${eTransfer()} Владение передано участнику <@${newId}>.`
        ).catch(() => {});
    } catch (e) {
        console.error('transferOwnership:', e);
    }
}

async function refreshPanel(channel, newOwnerId) {
    try {
        const messages = await channel.messages.fetch({ limit: 10 });
        const panelMsg = messages.find(m => m.author.id === client.user.id && m.components.length > 0);
        if (panelMsg) {
            const newMember = await channel.guild.members.fetch(newOwnerId).catch(() => null);
            if (newMember) {
                const newContainer = buildControlPanelV2(newMember, channel.id);
                await panelMsg.edit({
                    components: [newContainer],
                    flags: MessageFlags.IsComponentsV2
                });
            }
        }
    } catch (e) {}
}

// =========================
// 🔊 ЛУЖИ + УЧЁТ ГОЛОСА
// =========================
client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
        const m = newState.member || oldState.member;
        if (m && !m.user.bot) {
            if (!oldState.channelId && newState.channelId) {
                stats.startVoice(m.id);
            } else if (oldState.channelId && !newState.channelId) {
                const recorded = stats.endVoice(m.id);
                if (recorded) {
                    // 🆕 ЗАГЛУШКА: эволюция отключена
                    // checkMemberEvolution(m).catch(e => console.error('evo:', e));
                }
            }
        }

        if (newState.channelId === CREATE_ROOM_CHANNEL_ID && oldState.channelId !== CREATE_ROOM_CHANNEL_ID) {
            const member = newState.member;
            if (!member) return;
            await createRoomForMember(member, newState.guild);
        }

        if (oldState.channelId === newState.channelId) return;

        const oldChannel = oldState.channel;
        if (oldChannel &&
            oldChannel.id !== CREATE_ROOM_CHANNEL_ID &&
            oldChannel.type === ChannelType.GuildVoice &&
            isRoom(oldChannel.id)) {

            const prevOwnerId = roomOwners.get(oldChannel.id);
            const ownerLeft = prevOwnerId && oldState.member?.id === prevOwnerId;

            setTimeout(async () => {
                try {
                    const fresh = await oldChannel.fetch();
                    if (fresh.members.size === 0) {
                        removeRoomOwner(fresh.id);
                        await fresh.delete();
                        return;
                    }
                    if (ownerLeft) {
                        const next = fresh.members.find(x => !x.user.bot);
                        if (next) await transferOwnership(fresh, prevOwnerId, next.id, true);
                    }
                } catch {}
            }, 1500);
        }
    } catch (e) {
        console.error('voiceStateUpdate:', e);
    }
});

// =========================
// 🔘 КНОПКИ (V2)
// =========================
client.on('interactionCreate', async (interaction) => {
    try {
        if (!interaction.isButton()) return;
        const customId = interaction.customId;

        // 🆕 ЗАГЛУШКА: кнопки рейтинга отключены
        if (customId.startsWith('top_')) {
            return interaction.reply({
                content: DISABLED_MESSAGE,
                flags: MessageFlags.Ephemeral
            });
        }

        const channel = interaction.channel;
        if (!channel || !isRoom(channel.id)) {
            return interaction.reply({
                content: '🌊 Это не лужа — здесь нет кнопок Кувшинки.',
                flags: MessageFlags.Ephemeral
            });
        }

        const channelId = channel.id;
        const ownerId = roomOwners.get(channelId);

        if (interaction.member.id !== ownerId) {
            return interaction.reply({
                content: '🌿 Этой лужей управляет другой обитатель Пруда.',
                flags: MessageFlags.Ephemeral
            });
        }

        if (customId.startsWith('info_')) {
            const limitValue = channel.userLimit;
            const limitText = limitValue === 0 ? 'без лимита' : `${limitValue}`;
            const membersArr = channel.members.filter(m => !m.user.bot);

            const membersText = membersArr.size > 0
                ? membersArr.map(m => `<@${m.id}>`).join(', ')
                : '*никого — лужа пустует*';

            const regionText = channel.rtcRegion
                ? REGIONS.find(r => r.value === channel.rtcRegion)?.label || channel.rtcRegion
                : 'Автоматически';

            const everyone = interaction.guild.roles.everyone;
            const overwrite = channel.permissionOverwrites.cache.get(everyone.id);
            const isOpen = overwrite
                ? overwrite.allow.has('ViewChannel') || overwrite.allow.has('Connect')
                : true;

            const created = Math.floor(channel.createdTimestamp / 1000);
            const createdDate = `<t:${created}:D>`;
            const bitrateKbps = Math.round(channel.bitrate / 1000);

            const embed = new EmbedBuilder()
                .setColor(isOpen ? 0x2E8B57 : 0xED4245)
                .setAuthor({
                    name: 'Настройки лужи',
                    iconURL: client.user.displayAvatarURL()
                })
                .setTitle(`🌺 ${channel.name}`)
                .setThumbnail(ROOM_IMAGE_URL)
                .addFields(
                    {
                        name: `${eSettings()} Основное`,
                        value:
                            `${eTransfer()} **Владелец:** <@${ownerId}>\n` +
                            `${eFrogs()} **Заполнение:** ${membersArr.size} / ${limitText}\n` +
                            `${eGlobe()} **Регион:** ${regionText}\n` +
                            `🎚️ **Битрейт:** ${bitrateKbps} kbps`,
                        inline: false
                    },
                    {
                        name: `🌊 Обитатели (${membersArr.size})`,
                        value: membersText,
                        inline: false
                    },
                    {
                        name: `🚪 Доступ`,
                        value: isOpen
                            ? `${eUnlock()} Открыта для всех`
                            : `${eLock()} Закрыта от посторонних`,
                        inline: false
                    }
                )
                .setFooter({
                    text: `ID: ${channel.id} · Создана ${createdDate}`
                })
                .setTimestamp();

            return interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });
        }

        if (customId.startsWith('name_')) {
            const modal = new ModalBuilder()
                .setCustomId(`name_modal_${channelId}`)
                .setTitle('Переименование лужи');

            const input = new TextInputBuilder()
                .setCustomId('name_input')
                .setLabel('Новое название (до 100 символов)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Введите новое название...')
                .setMinLength(1)
                .setMaxLength(100)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

        if (customId.startsWith('status_')) {
            const modal = new ModalBuilder()
                .setCustomId(`status_modal_${channelId}`)
                .setTitle('Изменение статуса лужи');

            const input = new TextInputBuilder()
                .setCustomId('status_input')
                .setLabel('Новый статус (до 500 символов)')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Введите статус для вашей лужи...')
                .setMinLength(1)
                .setMaxLength(500)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

        if (customId.startsWith('limit_')) {
            const modal = new ModalBuilder()
                .setCustomId(`limit_modal_${channelId}`)
                .setTitle('Изменение лимита лягушек');

            const input = new TextInputBuilder()
                .setCustomId('limit_input')
                .setLabel('Лимит (0 — без лимита, макс. 99)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Введите число от 0 до 99...')
                .setMinLength(1)
                .setMaxLength(2)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

        if (customId.startsWith('region_')) {
            const select = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`region_select_${channelId}`)
                    .setPlaceholder('Выбери новое место обитания')
                    .addOptions(REGIONS.map(r => ({ label: r.label, value: r.value })).slice(0, 25))
            );
            return interaction.reply({
                content: `${eGlobe()} Выбери новое место обитания:`,
                components: [select],
                flags: MessageFlags.Ephemeral
            });
        }

        if (customId.startsWith('lock_')) {
            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: false });
            refreshPanel(channel, ownerId);
            return interaction.reply({
                content: `${eLock()} Лужа закрыта для чужих.`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (customId.startsWith('unlock_')) {
            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: true, Connect: true });
            refreshPanel(channel, ownerId);
            return interaction.reply({
                content: `${eUnlock()} Лужа открыта для всех!`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (customId.startsWith('transfer_')) {
            const inVoice = channel.members.filter(m => m.id !== interaction.member.id && !m.user.bot);
            if (inVoice.size === 0) {
                return interaction.reply({
                    content: '🌾 В луже пока никого нет — некого назначать.',
                    flags: MessageFlags.Ephemeral
                });
            }
            const select = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`transfer_select_${channelId}`)
                    .setPlaceholder('Выбери нового владельца')
                    .addOptions(inVoice.map(m => ({ label: m.displayName, value: m.id })).slice(0, 25))
            );
            return interaction.reply({
                content: `${eTransfer()} Выбери, кому передать лужу:`,
                components: [select],
                flags: MessageFlags.Ephemeral
            });
        }

        if (customId.startsWith('delete_')) {
            await interaction.reply({
                content: `${eTrash()} Лужа высыхает...`,
                flags: MessageFlags.Ephemeral
            });
            removeRoomOwner(channelId);
            await channel.delete().catch(() => {});
        }
    } catch (e) {
        if (e.code === 10062) {
            console.log('⚠️ Interaction устарел (10062) — пропускаем.');
        } else {
            console.error('Ошибка обработки кнопки:', e);
        }
    }
});

// =========================
// 📊 ЛОГИКА ТОПА (оставлена, но недоступна)
// =========================
async function buildTopEmbed(guild, metric, page, requestedBy) {
    const PER_PAGE = 10;
    const { total, items } = stats.getTop(metric, PER_PAGE, page * PER_PAGE);

    const titles = {
        voice: 'Рейтинг по голосу',
        days:  'Рейтинг по активным дням'
    };

    let description = '';
    for (let i = 0; i < items.length; i++) {
        const entry = items[i];
        const globalIdx = page * PER_PAGE + i;

        const mem = await guild.members.fetch(entry.userId).catch(() => null);
        const name = mem ? mem.displayName : `Участник`;

        let roleName = entry.role;
        if (mem) {
            const excluded = mem.roles.cache.find(r => config.EXCLUDED_ROLES.includes(r.id));
            if (excluded) roleName = excluded.name;
            else roleName = getDisplayRole(mem);
        }

        let value = '';
        if (metric === 'voice') value = stats.formatTime(entry.voiceSeconds);
        if (metric === 'days')  value = `${entry.activeDays} дн.`;

        description += `**#${globalIdx + 1}.** ${name} — ${roleName} — \`${value}\`\n`;
    }

    if (!description) description = 'Пока никого нет...';

    const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

    const embed = new EmbedBuilder()
        .setTitle(titles[metric] || 'Рейтинг')
        .setDescription(description)
        .setColor(0x5865F2)
        .setFooter({
            text: `Страница ${page + 1} из ${totalPages} | Всего: ${total} | Запросил ${requestedBy}`
        });

    return { embed, totalPages };
}

function buildTopButtons(metric, page, totalPages) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('top_voice')
                .setLabel('Голос')
                .setStyle(metric === 'voice' ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('top_days')
                .setLabel('Дни')
                .setStyle(metric === 'days' ? ButtonStyle.Primary : ButtonStyle.Secondary)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`top_page_${metric}_0`)
                .setLabel('В начало')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 0),
            new ButtonBuilder()
                .setCustomId(`top_page_${metric}_${page - 1}`)
                .setLabel('Назад')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 0),
            new ButtonBuilder()
                .setCustomId(`top_page_${metric}_${page + 1}`)
                .setLabel('Вперёд')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= totalPages - 1),
            new ButtonBuilder()
                .setCustomId(`top_page_${metric}_${totalPages - 1}`)
                .setLabel('В конец')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= totalPages - 1),
            new ButtonBuilder()
                .setCustomId('top_close')
                .setLabel('Закрыть')
                .setStyle(ButtonStyle.Danger)
        )
    ];
}

// =========================
// 📋 МОДАЛКИ + СЛЕШ-КОМАНДЫ + СЕЛЕКТЫ
// =========================
client.on('interactionCreate', async (interaction) => {
    try {
        // 🆕 ЗАГЛУШКИ СЛЕШ-КОМАНД
        if (interaction.isChatInputCommand()) {
            const { commandName } = interaction;

            if (commandName === 'top' || commandName === 'evolve') {
                return interaction.reply({
                    content: DISABLED_MESSAGE,
                    flags: MessageFlags.Ephemeral
                });
            }

            // /panel — оставляем рабочим (если он где-то реализован)
            // если обработчика нет — добавь его отдельно
            return;
        }

        if (interaction.isModalSubmit()) {
            const customId = interaction.customId;
            const channel = interaction.channel;
            if (!channel || !isRoom(channel.id)) return;

            const channelId = channel.id;
            const ownerId = roomOwners.get(channelId);

            if (interaction.member.id !== ownerId) {
                return interaction.reply({
                    content: '🌿 Этой лужей управляет другой обитатель Пруда.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (customId.startsWith('name_modal_')) {
                const raw = interaction.fields.getTextInputValue('name_input').trim();
                if (raw.length < 1) {
                    return interaction.reply({
                        content: '❌ Название не может быть пустым.',
                        flags: MessageFlags.Ephemeral
                    });
                }
                try {
                    await channel.setName(raw);
                } catch (e) {
                    console.error('setName:', e);
                    return interaction.reply({
                        content: '❌ Не удалось переименовать лужу. Проверь права бота.',
                        flags: MessageFlags.Ephemeral
                    });
                }
                return interaction.reply({
                    content: `${ePencil()} Лужа переименована в **${raw}**.`,
                    flags: MessageFlags.Ephemeral
                               return interaction.reply({
                    content: `${ePencil()} Лужа переименована в **${raw}**.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            if (customId.startsWith('status_modal_')) {
                const raw = interaction.fields.getTextInputValue('status_input').trim();
                if (raw.length < 1) {
                    return interaction.reply({
                        content: '❌ Статус не может быть пустым.',
                        flags: MessageFlags.Ephemeral
                    });
                }
                try {
                    await client.vcStatus.setVoiceStatus(channelId, raw);
                } catch (e) {
                    console.error('setVoiceStatus:', e);
                    return interaction.reply({
                        content: '❌ Не удалось установить статус. Возможно, Discord временно не поддерживает эту функцию.',
                        flags: MessageFlags.Ephemeral
                    });
                }
                return interaction.reply({
                    content: `${eSpeech()} Статус лужи обновлён: **${raw}**`,
                    flags: MessageFlags.Ephemeral
                });
            }

            if (customId.startsWith('limit_modal_')) {
                const raw = interaction.fields.getTextInputValue('limit_input').trim();
                const limit = parseInt(raw, 10);

                if (isNaN(limit) || limit < 0 || limit > 99) {
                    return interaction.reply({
                        content: '❌ Введи число от **0** до **99**. (0 — без лимита)',
                        flags: MessageFlags.Ephemeral
                    });
                }

                try {
                    await channel.setUserLimit(limit);
                } catch (e) {
                    console.error('setUserLimit:', e);
                    return interaction.reply({
                        content: '❌ Не удалось изменить лимит. Проверь права бота.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                return interaction.reply({
                    content: limit === 0
                        ? `${eFrogs()} Лимит снят — лужа без ограничений.`
                        : `${eFrogs()} Лимит установлен: **${limit}** лягушек.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            return;
        }

        // =========================
        // 📋 СЕЛЕКТЫ (регион / передача)
        // =========================
        if (interaction.isStringSelectMenu()) {
            const customId = interaction.customId;
            const channel = interaction.channel;

            if (!channel || !isRoom(channel.id)) {
                return interaction.reply({
                    content: '🌊 Это не лужа — здесь нет кнопок Кувшинки.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const channelId = channel.id;
            const ownerId = roomOwners.get(channelId);

            if (interaction.member.id !== ownerId) {
                return interaction.reply({
                    content: '🌿 Этой лужей управляет другой обитатель Пруда.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (customId.startsWith('region_select_')) {
                const value = interaction.values[0];

                try {
                    // 'auto' => null (автоматический выбор Discord)
                    await channel.setRTCRegion(value === 'auto' ? null : value);
                } catch (e) {
                    console.error('setRTCRegion:', e);
                    return interaction.reply({
                        content: '❌ Не удалось сменить регион. Проверь права бота.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const regionLabel = REGIONS.find(r => r.value === value)?.label || value;
                await refreshPanel(channel, ownerId);

                return interaction.reply({
                    content: `${eGlobe()} Место обитания изменено: **${regionLabel}**.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            if (customId.startsWith('transfer_select_')) {
                const newOwnerId = interaction.values[0];

                const target = channel.members.get(newOwnerId);
                if (!target) {
                    return interaction.reply({
                        content: '🌾 Этот участник уже покинул лужу — передача отменена.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                await transferOwnership(channel, ownerId, newOwnerId, false);

                return interaction.reply({
                    content: `${eTransfer()} Владение передано <@${newOwnerId}>.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            return;
        }

        return;
    } catch (e) {
        if (e.code === 10062) {
            console.log('⚠️ Interaction устарел (10062) — пропускаем.');
        } else {
            console.error('Ошибка обработки interaction:', e);
        }
    }
});

// =========================
// 🆕 ОБРАБОТЧИК /panel (если нужен)
// =========================
// Если у тебя уже есть отдельная реализация /panel — удали этот блок,
// чтобы не было двойной регистрации. Если нет — он вызовет панель в текущей луже.
client.on('interactionCreate', async (interaction) => {
    try {
        if (!interaction.isChatInputCommand()) return;
        if (interaction.commandName !== 'panel') return;

        const channel = interaction.channel;
        if (!channel || !isRoom(channel.id)) {
            return interaction.reply({
                content: '🌊 Эта команда работает только внутри личной лужи.',
                flags: MessageFlags.Ephemeral
            });
        }

        const ownerId = roomOwners.get(channel.id);
        if (interaction.member.id !== ownerId) {
            return interaction.reply({
                content: '🌿 Этой лужей управляет другой обитатель Пруда.',
                flags: MessageFlags.Ephemeral
            });
        }

        const container = buildControlPanelV2(interaction.member, channel.id);
        return interaction.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
    } catch (e) {
        if (e.code === 10062) {
            console.log('⚠️ Interaction устарел (10062) — пропускаем.');
        } else {
            console.error('Ошибка /panel:', e);
        }
    }
});

// =========================
// 🐸 ЛОГИН
// =========================
client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('❌ Не удалось войти в Discord:', err);
    process.exit(1);
});

// =========================
// 🛡️ ГЛОБАЛЬНЫЕ ПЕРЕХВАТЧИКИ
// =========================
process.on('unhandledRejection', (reason) => {
    console.error('⚠️ unhandledRejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('💥 uncaughtException:', err);
});