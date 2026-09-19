const path = require('path');
const dotenv = require('dotenv');
const express = require('express');

dotenv.config({
    path: path.join(__dirname, '.env'),
    override: true
});

const {
    Client,
    GatewayIntentBits,
    PermissionsBitField,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    MessageFlags
} = require('discord.js');

// =========================
// 🌐 HTTP-СЕРВЕР ДЛЯ KOYEB
// =========================
const app = express();
const PORT = process.env.PORT || 8000;

app.get('/', (req, res) => {
    res.send('🐸 Кувшинка онлайн');
});

app.listen(PORT, () => {
    console.log(`🌐 HTTP-сервер запущен на порту ${PORT}`);
});

// =========================
// 🐸 DISCORD-КЛИЕНТ
// =========================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// =========================
// 🐸 НАСТРОЙКИ
// =========================
const RULES_CHANNEL_ID = '1510063400535851198';
const WELCOME_CHANNEL_ID = '1510063211099983902';
const CREATE_ROOM_CHANNEL_ID = '1518746457988010045';
const ROOM_SUFFIX = "'s Лужа";

const roomOwners = new Map();

// =========================
// 🐸 ЗАПУСК
// =========================
client.once('ready', () => {
    console.log(`🐸 Кувшинка запущена как ${client.user.tag}`);
});

// =========================
// 👋 ПРИВЕТСТВИЕ
// =========================
client.on('guildMemberAdd', async (member) => {
    try {
        const welcomeChannel = await member.guild.channels
            .fetch(WELCOME_CHANNEL_ID)
            .catch(() => null);

        if (!welcomeChannel) {
            console.error('❌ Welcome-канал не найден!');
            return;
        }

        const me = member.guild.members.me;
        const permissions = welcomeChannel.permissionsFor(me);

        if (!permissions?.has(PermissionsBitField.Flags.SendMessages)) {
            console.error('❌ Нет прав на отправку в welcome-канал!');
            return;
        }

        await welcomeChannel.send(
            `🐸 Добро пожаловать в Пруд, ${member}!\n\n` +
            `🌿 Рады видеть тебя среди наших обитателей.\n` +
            `Пожалуйста, ознакомься с Болотным кодексом в <#${RULES_CHANNEL_ID}>.\n\n` +
            `Приятного плавания! 🌺`
        );

        console.log(`👋 Приветствие отправлено для ${member.user.tag}`);
    } catch (error) {
        console.error('❌ Ошибка при отправке приветствия:', error);
    }
});

// =========================
// 🔧 ПАНЕЛЬ УПРАВЛЕНИЯ
// =========================
function createControlPanel(channelId) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`limit_${channelId}`)
            .setLabel('Лимит')
            .setEmoji('👥')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`lock_${channelId}`)
            .setLabel('Закрыть')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`unlock_${channelId}`)
            .setLabel('Открыть')
            .setEmoji('🔓')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`transfer_${channelId}`)
            .setLabel('Передать')
            .setEmoji('👑')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`delete_${channelId}`)
            .setLabel('Удалить')
            .setEmoji('🧹')
            .setStyle(ButtonStyle.Danger)
    );

    return [row];
}

async function updatePanel(channel) {
    try {
        const messages = await channel.messages.fetch({ limit: 5 });
        const panel = messages.find(
            m => m.author.id === client.user.id && m.components.length > 0
        );
        if (panel) {
            await panel.edit({ components: createControlPanel(channel.id) });
        }
    } catch (e) {
        console.error('❌ Не удалось обновить панель:', e);
    }
}

// =========================
// 🔄 ПЕРЕДАЧА ВЛАДЕНИЯ
// =========================
async function transferOwnership(channel, oldOwnerId, newOwnerId, auto = false) {
    try {
        if (oldOwnerId) {
            await channel.permissionOverwrites.edit(oldOwnerId, {
                ManageChannels: false,
                MoveMembers: false,
                ViewChannel: true,
                Connect: true
            }).catch(err => console.error('⚠️ Не удалось снять права у старого владельца:', err));
        }

        await channel.permissionOverwrites.edit(newOwnerId, {
            ManageChannels: true,
            MoveMembers: true
        });

        roomOwners.set(channel.id, newOwnerId);
        await updatePanel(channel);

        const text = auto
            ? `👑 Владелец покинул лужу. Владение автоматически передано <@${newOwnerId}>.`
            : `👑 Владение передано участнику <@${newOwnerId}>.`;
        await channel.send(text).catch(() => {});

        console.log(`🔄 Владение лужей "${channel.name}" передано ${newOwnerId}`);
    } catch (error) {
        console.error('❌ Ошибка при передаче владения:', error);
    }
}

// =========================
// 🔊 ЛУЖИ
// =========================
client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
        if (
            newState.channelId === CREATE_ROOM_CHANNEL_ID &&
            oldState.channelId !== CREATE_ROOM_CHANNEL_ID
        ) {
            const member = newState.member;
            if (!member) return;

            const existing = newState.guild.channels.cache.find(
                c => c.name === `${member.displayName}${ROOM_SUFFIX}` &&
                     c.type === ChannelType.GuildVoice
            );
            if (existing && existing.members.size === 0) {
                await member.voice.setChannel(existing);
                return;
            }

            const triggerChannel = newState.channel;

            const room = await newState.guild.channels.create({
                name: `${member.displayName}${ROOM_SUFFIX}`,
                type: ChannelType.GuildVoice,
                parent: triggerChannel.parentId,
                permissionOverwrites: [
                    {
                        id: newState.guild.roles.everyone.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.Connect
                        ]
                    },
                    {
                        id: member.id,
                        allow: [
                            PermissionsBitField.Flags.ManageChannels,
                            PermissionsBitField.Flags.MoveMembers
                        ]
                    }
                ]
            });

            roomOwners.set(room.id, member.id);

            await room.send({
                content: `🌺 Это твоя личная лужа, ${member}!\nИспользуй кнопки ниже для управления.`,
                components: createControlPanel(room.id)
            }).catch(err => console.error('❌ Не удалось отправить панель:', err));

            console.log(`🌺 Создана лужа "${member.displayName}${ROOM_SUFFIX}"`);
            await member.voice.setChannel(room);
            console.log(`🐸 ${member.user.tag} перемещён в свою лужу`);
        }

        const oldChannel = oldState.channel;

        if (
            oldChannel &&
            oldChannel.id !== CREATE_ROOM_CHANNEL_ID &&
            oldChannel.type === ChannelType.GuildVoice &&
            oldChannel.name.endsWith(ROOM_SUFFIX)
        ) {
            const prevOwnerId = roomOwners.get(oldChannel.id);
            const ownerLeft = prevOwnerId && oldState.member?.id === prevOwnerId;

            setTimeout(async () => {
                try {
                    const fresh = await oldChannel.fetch();

                    if (fresh.members.size === 0) {
                        const name = fresh.name;
                        roomOwners.delete(fresh.id);
                        await fresh.delete();
                        console.log(`🧹 Пустая лужа "${name}" удалена`);
                        return;
                    }

                    if (ownerLeft && fresh.members.size > 0) {
                        const next = fresh.members.find(m => !m.user.bot);
                        if (next) {
                            await transferOwnership(fresh, prevOwnerId, next.id, true);
                        }
                    }
                } catch {
                    // Канал уже удалён
                }
            }, 1500);
        }
    } catch (error) {
        console.error('❌ Ошибка при работе с голосовыми комнатами:', error);
    }
});

// =========================
// 🔘 ОБРАБОТКА КНОПОК
// =========================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;
    const channel = interaction.channel;

    if (!channel?.name?.endsWith(ROOM_SUFFIX)) {
        return interaction.reply({
            content: '❌ Это не лужа.',
            flags: MessageFlags.Ephemeral
        });
    }

    const channelId = channel.id;
    const ownerId = roomOwners.get(channelId);
    const member = interaction.member;

    if (member.id !== ownerId) {
        return interaction.reply({
            content: '❌ Только владелец может управлять лужей.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (customId.startsWith('limit_')) {
        const select = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`limit_select_${channelId}`)
                .setPlaceholder('Выбери лимит участников')
                .addOptions([
                    { label: '2 участника', value: '2' },
                    { label: '3 участника', value: '3' },
                    { label: '5 участников', value: '5' },
                    { label: '10 участников', value: '10' },
                    { label: 'Без лимита', value: '0' }
                ])
        );

        return interaction.reply({
            content: '👥 Выбери новый лимит:',
            components: [select],
            flags: MessageFlags.Ephemeral
        });
    }

    if (customId.startsWith('lock_')) {
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
            ViewChannel: false
        });
        return interaction.reply({
            content: '🔒 Лужа закрыта.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (customId.startsWith('unlock_')) {
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
            ViewChannel: true,
            Connect: true
        });
        return interaction.reply({
            content: '🔓 Лужа открыта.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (customId.startsWith('transfer_')) {
        const inVoice = channel.members.filter(m => m.id !== member.id && !m.user.bot);

        if (inVoice.size === 0) {
            return interaction.reply({
                content: '⚠️ В луже никого нет, некого назначать владельцем.',
                flags: MessageFlags.Ephemeral
            });
        }

        const select = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`transfer_select_${channelId}`)
                .setPlaceholder('Выбери нового владельца')
                .addOptions(
                    inVoice
                        .map(m => ({
                            label: m.displayName,
                            value: m.id
                        }))
                        .slice(0, 25)
                )
        );

        return interaction.reply({
            content: '👑 Выбери, кому передать владение:',
            components: [select],
            flags: MessageFlags.Ephemeral
        });
    }

    if (customId.startsWith('delete_')) {
        await interaction.reply({
            content: '🧹 Лужа закрывается...',
            flags: MessageFlags.Ephemeral
        });
        roomOwners.delete(channelId);
        await channel.delete().catch(() => {});
    }
});

// =========================
// 📋 ОБРАБОТКА ВЫПАДАЮЩИХ СПИСКОВ
// =========================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;

    const customId = interaction.customId;
    const channel = interaction.channel;

    if (!channel?.name?.endsWith(ROOM_SUFFIX)) return;

    const channelId = channel.id;
    const ownerId = roomOwners.get(channelId);
    const member = interaction.member;

    if (customId.startsWith('limit_select_')) {
        if (member.id !== ownerId) {
            return interaction.update({ content: '❌ Нет прав.', components: [] });
        }

        const limit = parseInt(interaction.values[0], 10);
        await channel.setUserLimit(limit);

        const text = limit === 0 ? 'без лимита' : `${limit} участников`;
        return interaction.update({
            content: `✅ Лимит изменён: ${text}`,
            components: []
        });
    }

    if (customId.startsWith('transfer_select_')) {
        if (member.id !== ownerId) {
            return interaction.update({ content: '❌ Нет прав.', components: [] });
        }

        const newOwnerId = interaction.values[0];
        const newOwner = await interaction.guild.members
            .fetch(newOwnerId)
            .catch(() => null);

        if (!newOwner) {
            return interaction.update({
                content: '❌ Не удалось найти участника.',
                components: []
            });
        }

        await interaction.update({
            content: `⏳ Передаю владение ${newOwner}...`,
            components: []
        });

        try {
            await transferOwnership(channel, ownerId, newOwnerId, false);
            await interaction.editReply({
                content: `✅ Владение передано ${newOwner}.`,
                components: []
            });
        } catch (error) {
            console.error('❌ Ошибка при передаче владения:', error);
            await interaction.editReply({
                content: '❌ Ошибка при передаче владения.',
                components: []
            }).catch(() => {});
        }
    }
});

// =========================
// 🧹 АККУРАТНЫЙ ВЫХОД
// =========================
let shuttingDown = false;

async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`\n🧹 Получен ${signal}. Кувшинка уходит на дно...`);

    const forceExit = setTimeout(() => {
        console.log('⏱ Время вышло, выходим принудительно');
        process.exit(0);
    }, 5000);

    let deleted = 0;

    try {
        for (const guild of client.guilds.cache.values()) {
            const channels = await guild.channels.fetch().catch(() => null);
            if (!channels) continue;

            for (const channel of channels.values()) {
                if (
                    channel?.name?.endsWith(ROOM_SUFFIX) &&
                    channel.type === ChannelType.GuildVoice &&
                    channel.members?.size === 0
                ) {
                    const ok = await channel
                        .delete()
                        .then(() => true)
                        .catch(() => false);

                    if (ok) {
                        deleted++;
                        roomOwners.delete(channel.id);
                        console.log(`  🧹 Удалена: ${channel.name}`);
                    }
                }
            }
        }
    } catch (e) {
        console.error('❌ Ошибка при чистке:', e);
    }

    console.log(`✅ Удалено пустых луж: ${deleted}`);
    clearTimeout(forceExit);
    client.destroy();
    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// =========================
// 🔐 ВХОД
// =========================
client.login(process.env.DISCORD_TOKEN);