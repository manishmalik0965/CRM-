import React, { createContext, useState, useEffect, useContext } from 'react';
import { api } from '@/lib/api';

export const AuthContext = createContext<any>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const checkAuth = async () => {
            // Check for superadmin_token in query parameter
            const searchParams = new URLSearchParams(window.location.search);
            const queryToken = searchParams.get('superadmin_token');
            if (queryToken) {
                localStorage.setItem('accessToken', queryToken);
                searchParams.delete('superadmin_token');
                const remainingParams = searchParams.toString();
                const newUrl = window.location.pathname + (remainingParams ? '?' + remainingParams : '');
                window.history.replaceState({}, document.title, newUrl);
            }

            const token = localStorage.getItem('accessToken');
            if (!token) {
                setIsLoading(false);
                return;
            }
            try {
                const res = await api.get('/auth/me');
                setUser(res.data.user);
            } catch (err) {
                localStorage.removeItem('accessToken');
            } finally {
                setIsLoading(false);
            }
        };
        checkAuth();
    }, []);

    const logout = () => {
        localStorage.removeItem('accessToken');
        sessionStorage.removeItem('mfa_verified');
        setUser(null);
    };

    return <AuthContext.Provider value={{ user, setUser, isLoading, logout }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
