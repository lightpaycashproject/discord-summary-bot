/**
 * Centralized error handler for Discord commands.
 * Logs the error and sends an ephemeral reply to the user.
 * @param {Object} interaction - Discord interaction
 * @param {Error} error - The caught error
 * @param {string} userMessage - Message to show the user
 */
async function handleCommandError(
  interaction,
  error,
  userMessage = "An error occurred while executing this command!",
) {
  console.error(`Command Error [${interaction.commandName}]:`, error.message);

  const payload = { content: userMessage, ephemeral: true };

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch (e) {
    console.error("Failed to send error reply:", e.message);
  }
}

module.exports = { handleCommandError };
