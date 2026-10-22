import {
    Activity, ClipboardList, FileText, Calendar, Users,
    DollarSign, Package, Truck, ShoppingCart, Coffee,
    Briefcase, CheckSquare, ListTodo, Bell, Star,
    Folder, BookOpen, Database, TrendingUp
} from 'lucide-react';

interface Props {
    emoji: string;
    className?: string;
    size?: number;
}

// Mapeo de emojis comunes a iconos profesionales
const iconMap: Record<string, any> = {
    '📡': Activity,
    '📲': TrendingUp,
    '📊': ClipboardList,
    '📄': FileText,
    '📅': Calendar,
    '👥': Users,
    '💰': DollarSign,
    '📦': Package,
    '🚚': Truck,
    '🛒': ShoppingCart,
    '☕': Coffee,
    '💼': Briefcase,
    '✅': CheckSquare,
    '📝': ListTodo,
    '🔔': Bell,
    '⭐': Star,
    '📁': Folder,
    '📖': BookOpen,
    '🗄️': Database,
};

export default function AppIcon({ emoji, className = "", size = 20 }: Props) {
    const IconComponent = iconMap[emoji] || FileText;
    return <IconComponent className={className} size={size} strokeWidth={2} />;
}