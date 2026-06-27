require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, onChildAdded } = require('firebase/database');

// ─── CONFIG (แก้ใน .env) ──────────────────────────────────────
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID      = process.env.GUILD_ID;
const CATEGORY_ID   = process.env.CATEGORY_ID;
const ADMIN_ID      = process.env.ADMIN_ID;
const INVITE_LINK   = process.env.INVITE_LINK || 'https://discord.gg/r4EZPJ4Tt';

const firebaseConfig = {
  apiKey:      process.env.FB_API_KEY,
  authDomain:  process.env.FB_AUTH_DOMAIN,
  databaseURL: process.env.FB_DATABASE_URL,
  projectId:   process.env.FB_PROJECT_ID,
};

// ─── INIT ─────────────────────────────────────────────────────
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const db = getDatabase(initializeApp(firebaseConfig));

// ─── BOT READY ────────────────────────────────────────────────
client.once('ready', () => {
  console.log(`✅ Bot พร้อม: ${client.user.tag}`);
  console.log(`📡 กำลัง watch Firebase queue...`);

  onChildAdded(ref(db, 'queue'), async (snapshot) => {
    const item = snapshot.val();
    const key  = snapshot.key;
    if (!item) return;

    console.log(`📥 ออเดอร์ใหม่: ${item.name} | ${item.service} | discordId: ${item.discordId || 'ไม่มี'}`);

    if (!item.discordId) {
      console.log(`⚠️  ลูกค้าไม่ได้ผูก Discord → ข้าม`);
      return;
    }

    await createPrivateChannel(item, key);
  });
});

// ─── สร้าง Private Channel ────────────────────────────────────
async function createPrivateChannel(item, firebaseKey) {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);

    // ดึง member จาก Discord ID
    const member = await guild.members.fetch(item.discordId).catch(() => null);

    // ถ้ายังไม่ได้เข้า Server → DM ให้เข้าก่อน
    if (!member) {
      console.log(`⚠️  ไม่พบ Member ใน Server: ${item.discordId}`);
      const user = await client.users.fetch(item.discordId).catch(() => null);
      if (user) {
        await user.send(
          `👋 สวัสดีครับ **${item.name}**!\n\n` +
          `✅ ได้รับออเดอร์ **${item.service}** แล้ว\n\n` +
          `📌 กรุณาเข้า Server ของเราเพื่อรับห้องแชทส่วนตัว:\n` +
          `🔗 ${INVITE_LINK}`
        ).catch(() => console.log(`❌ DM ส่งไม่ได้: ${item.discordId}`));
      }
      return;
    }

    // ชื่อห้อง
    const safeName = (item.name || 'customer')
      .replace(/\s+/g, '-')
      .toLowerCase()
      .slice(0, 15);
    const channelName = `order-${safeName}-${firebaseKey.slice(-4)}`;

    // สร้างห้อง
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: CATEGORY_ID,
      topic: `${item.name} | ${item.service} | ref: ${firebaseKey}`,
      permissionOverwrites: [
        // ซ่อนจากทุกคน
        { id: guild.id,        deny:  [PermissionFlagsBits.ViewChannel] },
        // Bot
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
        // Admin
        { id: ADMIN_ID,       allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        // ลูกค้า
        { id: member.id,      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ],
    });

    // ส่งข้อความต้อนรับ
    await channel.send(
      `👋 สวัสดีครับ <@${member.id}>!\n\n` +
      `📋 **สรุปออเดอร์ของคุณ**\n` +
      `> 🎮 **บริการ:** ${item.service}\n` +
      `> 📝 **รายละเอียด:** ${item.detail || '-'}\n` +
      `> 🌐 **Server:** ${item.server || 'Asia'}\n` +
      `> ⚡ **ด่วน:** ${item.urgent ? 'ใช่ (+20%)' : 'ไม่'}\n\n` +
      `✅ ทีมงานจะติดต่อกลับในห้องนี้เร็วๆ นี้ครับ 🙏`
    );

    console.log(`✅ สร้างห้องสำเร็จ: #${channelName}`);

  } catch (err) {
    console.error('❌ createPrivateChannel error:', err.message);
  }
}

client.login(DISCORD_TOKEN);
