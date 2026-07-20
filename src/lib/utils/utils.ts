// function to convert a string to uppercase each word
export function capitalize(str?: string | null) {
  if (!str) return "";
  const words = str.split(" ");
  // if there is only 1 word, return the original string
  if (words.length === 1) return str;
  // if there are multiple words, capitalize each word
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export const openInNewTab = (url: string) => {
  try {
    const newWindow = window.open(url, "_blank", "noopener noreferrer");
    if (newWindow) {
      newWindow.opener = null;
      newWindow.focus(); // Optional: Bring the new tab to the foreground
    }
  } catch (error) {
    // Handle potential errors gracefully
    console.error("Error opening URL in new tab:", error);
    // Optionally, provide user feedback (e.g., display an error message)
    // ... inside the catch block ...
    if (error instanceof DOMException && error.name === "SecurityError") {
      // Pop-up blocked, offer alternative to the user
      alert("Pop-up blocked. Please allow pop-ups for this site.");
    } else {
      // Generic error message
      alert("An error occurred while opening the link.");
    }
  }
};
