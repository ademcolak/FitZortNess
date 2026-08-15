const ADMIN_TELEGRAM_COMMANDS = [
  { command: "help", description: "Admin komutlarini goster" }
];

export function getTelegramCommandSetupOperations(adminUserIds) {
  return [
    { method: "deleteMyCommands", body: { scope: { type: "default" } } },
    ...adminUserIds.map((userId) => ({
      method: "setMyCommands",
      body: {
        commands: ADMIN_TELEGRAM_COMMANDS,
        scope: { type: "chat", chat_id: Number(userId) }
      }
    }))
  ];
}
