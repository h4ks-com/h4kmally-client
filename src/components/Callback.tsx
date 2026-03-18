import { useHandleSignInCallback } from "@logto/react";

export function Callback() {
  const { isLoading } = useHandleSignInCallback(() => {
    window.location.href = "/";
  });

  if (isLoading) {
    return (
      <div
        style={{
          color: "#333136",
          textAlign: "center",
          marginTop: "20vh",
          fontFamily: "Arial, sans-serif",
          fontSize: "18px",
        }}
      >
        Signing in...
      </div>
    );
  }

  return null;
}
