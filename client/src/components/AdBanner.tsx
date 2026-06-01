import React, { useEffect } from 'react';

interface AdBannerProps {
	slot: string;
	style?: React.CSSProperties;
	className?: string;
}

const AdBanner: React.FC<AdBannerProps> = ({ slot, style, className }) => {
	useEffect(() => {
		try {
			// @ts-expect-error adsbygoogle is injected at runtime by the Google AdSense script
			(window.adsbygoogle = window.adsbygoogle || []).push({});
		} catch (e) {
			console.error('Ad error:', e);
		}
	}, []);

	return (
		<div className={className} style={style}>
			<ins
				className="adsbygoogle"
				style={{ display: 'block' }}
				data-ad-client="ca-pub-XXXXXXXXXXXXXXXX" // Replace with your AdSense client ID
				data-ad-slot={slot}
				data-ad-format="auto"
				data-full-width-responsive="true"
			></ins>
		</div>
	);
};

export default AdBanner;
