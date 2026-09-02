// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import { ChevronDown, LogOut, Wallet, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar.tsx';
import { useLoggedInAccounts, type Account } from '@/hooks/useLoggedInAccounts';
import { useLoginActions } from '@/hooks/useLoginActions';
import { genUserName } from '@/lib/genUserName';
import { WalletModal } from '@/components/WalletModal';

export function AccountSwitcher() {
  const { currentUser, otherUsers, setLogin } = useLoggedInAccounts();
  const { logout } = useLoginActions();

  if (!currentUser) return null;

  const getDisplayName = (account: Account): string => {
    return account.metadata.name ?? genUserName(account.pubkey);
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button className='flex items-center gap-3 p-3 rounded-full hover:bg-accent transition-all w-full text-foreground'>
            <Avatar className='w-10 h-10'>
              <AvatarImage src={currentUser.metadata.picture} alt={getDisplayName(currentUser)} />
              <AvatarFallback>{getDisplayName(currentUser).charAt(0)}</AvatarFallback>
            </Avatar>
            <div className='flex-1 text-left hidden md:block truncate'>
              <p className='font-medium text-sm truncate'>{getDisplayName(currentUser)}</p>
            </div>
            <ChevronDown className='w-4 h-4 text-muted-foreground' />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className='w-56 p-2 animate-scale-in'>
          <DropdownMenuItem asChild>
            <Link to='/profile' className='flex items-center gap-2 cursor-pointer p-2 rounded-md'>
              <User className='w-4 h-4' />
              <span>Profile</span>
            </Link>
          </DropdownMenuItem>

          <WalletModal>
            <DropdownMenuItem
              onSelect={(e) => e.preventDefault()}
              className='flex items-center gap-2 cursor-pointer p-2 rounded-md'
            >
              <Wallet className='w-4 h-4' />
              <span>Wallet Settings</span>
            </DropdownMenuItem>
          </WalletModal>

          {otherUsers.length > 0 && (
            <>
              <DropdownMenuSeparator />
              {otherUsers.map((account) => (
                <DropdownMenuItem
                  key={account.id}
                  onClick={() => setLogin(account.id)}
                  className='flex items-center gap-2 cursor-pointer p-2 rounded-md'
                >
                  <Avatar className='w-5 h-5'>
                    <AvatarImage src={account.metadata.picture} alt={getDisplayName(account)} />
                    <AvatarFallback className='text-[10px]'>{getDisplayName(account).charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className='truncate'>{getDisplayName(account)}</span>
                </DropdownMenuItem>
              ))}
            </>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => logout()}
            className='flex items-center gap-2 cursor-pointer p-2 rounded-md text-red-500'
          >
            <LogOut className='w-4 h-4' />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}