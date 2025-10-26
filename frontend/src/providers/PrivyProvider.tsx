import { PrivyProvider } from '@privy-io/react-auth';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider 
      appId={import.meta.env.VITE_PRIVY_APP_ID} 
      config={{ 
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } } 
      }}
    >
      {children}
    </PrivyProvider>
  );
}