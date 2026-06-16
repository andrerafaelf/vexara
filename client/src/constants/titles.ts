export const TITLE_META: Record<string, string> = {
	// ── Supporter titles (Ko-fi) ─────────────────────────────────────────────
	'Recruit':          'Supporter who backed Vexara at the €5 tier.',
	'Officer':          'Supporter who backed Vexara at the €10 tier.',
	'Vanguard':         'Supporter who backed Vexara at the €25 tier.',
	'Commander':        'Supporter who backed Vexara at the Commander tier.',
	'Alpha Commander':  'Commander-tier supporter who backed Vexara during alpha.',

	// ── Season / commander titles ────────────────────────────────────────────
	'Conqueror':        'Won a galaxy season.',
	'Warlord':          'Won two or more galaxy seasons.',
	'Veteran':          'Played three or more galaxy seasons.',
	'Iron Commander':   'Played every galaxy season since joining — loyalty rewarded.',

	// ── Faction titles ───────────────────────────────────────────────────────
	'Iron Pact':        'Earned by completing the Iron Pact faction campaign.',
	'Eternal Vanguard': 'Earned by completing the Eternal Vanguard faction campaign.',
	'Static Eye':       'Earned by completing the Static Eye faction campaign.',

	// ── Battle pass titles (Season One) ─────────────────────────────────────
	'Conscript':        'Unlocked at rank 1 of the Season One paid campaign.',
	'Operative':        'Unlocked at rank 8 of the Season One paid campaign.',
	'Proven':           'Unlocked at rank 18 of the Season One paid campaign.',
	'Vex Commander':    'Unlocked at rank 30 of the Season One paid campaign.',
	'High Commander':   'Unlocked at rank 45 of the Season One paid campaign.',
	'Season Conqueror': 'Unlocked by completing all 50 ranks of the Season One paid campaign.',

	// ── Challenge titles: Butcher ────────────────────────────────────────────
	'Combatant':       'Butcher — first tier. Troops eliminated in combat.',
	'Slaughterer':     'Butcher — second tier. Troops eliminated in combat.',
	'Exterminator':    'Butcher — third tier. Troops eliminated in combat.',
	'Annihilator':     'Butcher — fourth tier. Troops eliminated in combat.',
	'God of War':      'Butcher — highest tier. Troops eliminated in combat.',

	// ── Challenge titles: Acceptable Losses ──────────────────────────────────
	'Expendable':        'Acceptable Losses — first tier. Troops lost in combat.',
	'Blood Price':       'Acceptable Losses — second tier. Troops lost in combat.',
	'The Fallen':        'Acceptable Losses — third tier. Troops lost in combat.',
	'Pyrrhic':           'Acceptable Losses — fourth tier. Troops lost in combat.',

	// ── Challenge titles: Blitz ──────────────────────────────────────────────
	'Fighter':           'Blitz — first tier. Attacks launched.',
	'Striker':           'Blitz — second tier. Attacks launched.',
	'Blade of the Vex':  'Blitz — third tier. Attacks launched.',
	'Apex Predator':     'Blitz — fourth tier. Attacks launched.',
	'The Inevitable':    'Blitz — highest tier. Attacks launched.',

	// ── Challenge titles: Iron Wall ──────────────────────────────────────────
	'Sentry':            'Iron Wall — first tier. Attacks defended.',
	'Defender':          'Iron Wall — second tier. Attacks defended.',
	'Bulwark':           'Iron Wall — third tier. Attacks defended.',
	'Iron Wall':         'Iron Wall — fourth tier. Attacks defended.',
	'Citadel':           'Iron Wall — highest tier. Attacks defended.',

	// ── Challenge titles: Nexus Breaker ─────────────────────────────────────
	'Raider':            'Nexus Breaker — first tier. Nexuses captured.',
	'Plunderer':         'Nexus Breaker — second tier. Nexuses captured.',
	'Despoiler':         'Nexus Breaker — third tier. Nexuses captured.',
	'Nexus Breaker':     'Nexus Breaker — fourth tier. Nexuses captured.',
	'World Eater':       'Nexus Breaker — highest tier. Nexuses captured.',

	// ── Challenge titles: Berserker ──────────────────────────────────────────
	'Agitator':          'Berserker — first tier. Unique enemies engaged.',
	'Provocateur':       'Berserker — second tier. Unique enemies engaged.',
	'Instigator':        'Berserker — third tier. Unique enemies engaged.',
	'Berserker':         'Berserker — highest tier. Unique enemies engaged.',

	// ── Challenge titles: Eyes Open ──────────────────────────────────────────
	'Spotter':           'Eyes Open — first tier. Scout missions conducted.',
	'Scout':             'Eyes Open — second tier. Scout missions conducted.',
	'Pathfinder':        'Eyes Open — third tier. Scout missions conducted.',
	'Shadow Eye':        'Eyes Open — highest tier. Scout missions conducted.',

	// ── Challenge titles: Guardian ───────────────────────────────────────────
	'Watchman':          'Guardian — first tier. Defense victories.',
	'Shield Bearer':     'Guardian — second tier. Defense victories.',
	'Bastion':           'Guardian — third tier. Defense victories.',
	'Guardian':          'Guardian — fourth tier. Defense victories.',
	'Inviolate':         'Guardian — highest tier. Defense victories.',

	// ── Challenge titles: Flawless ───────────────────────────────────────────
	'Precise':           'Flawless — first tier. Perfect victories with zero losses.',
	'Immaculate':        'Flawless — second tier. Perfect victories with zero losses.',
	'Unchallenged':      'Flawless — third tier. Perfect victories with zero losses.',
	'Flawless':          'Flawless — highest tier. Perfect victories with zero losses.',

	// ── Challenge titles: Defeat Accepted ───────────────────────────────────
	'Bloodied':          'Defeat Accepted — first tier. Defeats endured.',
	'Battle-Scarred':    'Defeat Accepted — second tier. Defeats endured.',
	'Survivor':          'Defeat Accepted — third tier. Defeats endured.',
	'Never Surrendered': 'Defeat Accepted — highest tier. Defeats endured.',

	// ── Challenge titles: Alliance Strength ─────────────────────────────────
	'Ally':                  'Alliance Strength — first tier. Support missions sent.',
	'Reinforcer':            'Alliance Strength — second tier. Support missions sent.',
	'Brotherhood':           'Alliance Strength — third tier. Support missions sent.',
	'Unbreakable Alliance':  'Alliance Strength — highest tier. Support missions sent.',

	// ── Challenge titles: Logistics Corps ───────────────────────────────────
	'Auxiliary':         'Logistics Corps — first tier. Resources stolen.',
	'Quartermaster':     'Logistics Corps — second tier. Resources stolen.',
	'Logistics Officer': 'Logistics Corps — third tier. Resources stolen.',
	'Iron Supply':       'Logistics Corps — highest tier. Resources stolen.',

	// ── Challenge titles: Arms Race ──────────────────────────────────────────
	'Drill Sergeant':    'Arms Race — first tier. Troops trained lifetime.',
	'War Machine':       'Arms Race — second tier. Troops trained lifetime.',
	'Grand Arsenal':     'Arms Race — third tier. Troops trained lifetime.',
	'Forge of Worlds':   'Arms Race — fourth tier. Troops trained lifetime.',
	'Legion Eternal':    'Arms Race — highest tier. Troops trained lifetime.',

	// ── Challenge titles: Empire Builder ─────────────────────────────────────
	'Settler':           'Empire Builder — first tier. Nexuses held simultaneously.',
	'Colonist':          'Empire Builder — second tier. Nexuses held simultaneously.',
	'Expansionist':      'Empire Builder — third tier. Nexuses held simultaneously.',
	'Overlord':          'Empire Builder — fourth tier. Nexuses held simultaneously.',
	'Emperor':           'Empire Builder — highest tier. Nexuses held simultaneously.',

	// ── Challenge titles: Influence Broker ──────────────────────────────────
	'Ensign':            'Influence Broker — first tier. Lifetime influence earned.',
	// 'Commander' already defined above (supporter title takes precedence in UI)
	'Grand Commander':   'Influence Broker — third tier. Lifetime influence earned.',
	'Supreme Warlord':   'Influence Broker — fourth tier. Lifetime influence earned.',
	'Eternal Sovereign': 'Influence Broker — highest tier. Lifetime influence earned.',

	// ── Challenge titles: Peak Performance ──────────────────────────────────
	'Rising Power':      'Peak Performance — first tier. Best galaxy season points.',
	'Dominant Force':    'Peak Performance — second tier. Best galaxy season points.',
	'Hegemon':           'Peak Performance — third tier. Best galaxy season points.',
	'Titan of the Vex':  'Peak Performance — fourth tier. Best galaxy season points.',
	'Singularity':       'Peak Performance — highest tier. Best galaxy season points.',

	// ── Challenge titles: Mass Mobilisation ─────────────────────────────────
	'Conscript Commander': 'Mass Mobilisation — first tier. Total season influence accumulated.',
	'Mobiliser':           'Mass Mobilisation — second tier. Total season influence accumulated.',
	'Warlord of Legions':  'Mass Mobilisation — third tier. Total season influence accumulated.',
	'Grand Marshal':       'Mass Mobilisation — highest tier. Total season influence accumulated.',

	// ── Challenge titles: Galaxy Winner ─────────────────────────────────────
	// 'Conqueror' and 'Warlord' defined above (commander titles)
	'Supreme Commander': 'Galaxy Winner — third tier. Galaxies won.',
	'Galaxy Master':     'Galaxy Winner — highest tier. Galaxies won.',

	// ── Challenge titles: Veteran Traveler ──────────────────────────────────
	// 'Recruit' and 'Veteran' already defined above (supporter/commander)
	'Seasoned Commander': 'Veteran Traveler — third tier. Galaxies played.',
	'Eternal Traveler':   'Veteran Traveler — highest tier. Galaxies played.',

	// ── Challenge titles: Season Contender ──────────────────────────────────
	'Contender':         'Season Contender — first tier. Total season points accumulated.',
	'Challenger':        'Season Contender — second tier. Total season points accumulated.',
	'Apex Contender':    'Season Contender — third tier. Total season points accumulated.',
	'Season Titan':      'Season Contender — fourth tier. Total season points accumulated.',
	'Living Legend':     'Season Contender — highest tier. Total season points accumulated.',

	// ── Challenge titles: Dynasty ────────────────────────────────────────────
	'Heir':              'Dynasty — first tier. Galaxies won.',
	'Sovereign':         'Dynasty — second tier. Galaxies won.',
	'Dynast':            'Dynasty — third tier. Galaxies won.',
	'Immortal Dynasty':  'Dynasty — highest tier. Galaxies won.',

	// ── Challenge titles: Never Stop ─────────────────────────────────────────
	'Returning':         'Never Stop — first tier. Galaxies played across all seasons.',
	'Persistent':        'Never Stop — second tier. Galaxies played across all seasons.',
	'Relentless':        'Never Stop — third tier. Galaxies played across all seasons.',
	'Undying':           'Never Stop — highest tier. Galaxies played across all seasons.',

	// ── Challenge titles: Market Veteran ─────────────────────────────────────
	'Trader':            'Market Veteran — first tier. Trades made on the market.',
	'Broker':            'Market Veteran — second tier. Trades made on the market.',
	'Exchange Master':   'Market Veteran — third tier. Trades made on the market.',
	'Market Veteran':    'Market Veteran — highest tier. Trades made on the market.',

	// ── Challenge titles: Commodity King ────────────────────────────────────
	'Vendor':            'Commodity King — first tier. Total trade volume.',
	'Merchant Prince':   'Commodity King — second tier. Total trade volume.',
	'Trade Baron':       'Commodity King — third tier. Total trade volume.',
	'Commodity King':    'Commodity King — highest tier. Total trade volume.',

	// ── Challenge titles: War Profiteer ─────────────────────────────────────
	'Scavenger':         'War Profiteer — first tier. Resources stolen in combat.',
	'Looter':            'War Profiteer — second tier. Resources stolen in combat.',
	'War Profiteer':     'War Profiteer — third tier. Resources stolen in combat.',
	'Void Merchant':     'War Profiteer — highest tier. Resources stolen in combat.',

	// ── Challenge titles: The Price of War ──────────────────────────────────
	'Raided':            'The Price of War — first tier. Resources lost to enemy raids.',
	'Stripped':          'The Price of War — second tier. Resources lost to enemy raids.',
	'Plundered':         'The Price of War — third tier. Resources lost to enemy raids.',
	'Scorched Earth':    'The Price of War — highest tier. Resources lost to enemy raids.',

	// ── Challenge titles: Black Market ──────────────────────────────────────
	'Fence':             'Black Market — first tier. Trades made on the market.',
	'Dealer':            'Black Market — second tier. Trades made on the market.',
	'Trafficker':        'Black Market — third tier. Trades made on the market.',
	'Black Market Baron': 'Black Market — highest tier. Trades made on the market.',

	// ── Challenge titles: Resource Baron ────────────────────────────────────
	'Opportunist':       'Resource Baron — first tier. Resources stolen.',
	'Exploiter':         'Resource Baron — second tier. Resources stolen.',
	'Exactor':           'Resource Baron — third tier. Resources stolen.',
	'Resource Baron':    'Resource Baron — highest tier. Resources stolen.',

	// ── Challenge titles: Old Guard ──────────────────────────────────────────
	'Initiate':          'Old Guard — first tier. Days in service.',
	'Steadfast':         'Old Guard — second tier. Days in service.',
	'Iron Loyal':        'Old Guard — third tier. Days in service.',
	'Old Guard':         'Old Guard — fourth tier. Days in service.',
	'Immortal':          'Old Guard — highest tier. Days in service.',

	// ── Challenge titles: Two Years of Service ──────────────────────────────
	'Devoted':           'Two Years of Service — first tier. Days in service.',
	'Faithful':          'Two Years of Service — second tier. Days in service.',
	'Two-Year Veteran':  'Two Years of Service — third tier. Days in service.',
	'Eternal Servant':   'Two Years of Service — highest tier. Days in service.',

	// ── Challenge titles: Word of Mouth ─────────────────────────────────────
	'Recruiter':         'Word of Mouth — first tier. Players referred.',
	'Headhunter':        'Word of Mouth — second tier. Players referred.',
	'Talent Scout':      'Word of Mouth — third tier. Players referred.',
	'Legion Builder':    'Word of Mouth — highest tier. Players referred.',

	// ── Challenge titles: Half-Year Commander ───────────────────────────────
	'Present':               'Half-Year Commander — first tier. Days in service.',
	'Committed':             'Half-Year Commander — second tier. Days in service.',
	'Entrenched':            'Half-Year Commander — third tier. Days in service.',
	'Half-Year Commander':   'Half-Year Commander — highest tier. Days in service.',

	// ── Challenge titles: Founding Era ──────────────────────────────────────
	'Early Arrival':     'Founding Era — first tier. Days in service.',
	'Pioneer':           'Founding Era — second tier. Days in service.',
	'Founding Member':   'Founding Era — third tier. Days in service.',
	'Vex Original':      'Founding Era — highest tier. Days in service.',

	// ── Challenge titles: Shock & Awe ───────────────────────────────────────
	'Territorial':       'Shock & Awe — first tier. Attacks launched.',
	'Shock Trooper':     'Shock & Awe — second tier. Attacks launched.',
	'Shock & Awe':       'Shock & Awe — highest tier. Attacks launched.',

	// ── Challenge titles: Total War ──────────────────────────────────────────
	'Skirmish Veteran':  'Total War — first tier. Attacks launched.',
	'Front Line':        'Total War — second tier. Attacks launched.',
	'Total War':         'Total War — third tier. Attacks launched.',
	'Endless Conflict':  'Total War — highest tier. Attacks launched.',

	// ── Challenge titles: Ghost Protocol ────────────────────────────────────
	'Lurker':               'Ghost Protocol — first tier. Scout missions conducted.',
	'Intelligence Officer': 'Ghost Protocol — second tier. Scout missions conducted.',
	'Ghost':                'Ghost Protocol — third tier. Scout missions conducted.',
	'Phantom Watch':        'Ghost Protocol — highest tier. Scout missions conducted.',

	// ── Challenge titles: Massacre ───────────────────────────────────────────
	'Executioner':       'Massacre — first tier. Troops killed per battle.',
	'Massacre':          'Massacre — second tier. Troops killed per battle.',
	'Decimator':         'Massacre — third tier. Troops killed per battle.',
	'Void Reaper':       'Massacre — highest tier. Troops killed per battle.',

	// ── Challenge titles: Steel Nerve ───────────────────────────────────────
	'Composed':          'Steel Nerve — first tier. Defense victories.',
	'Resolute':          'Steel Nerve — second tier. Defense victories.',
	'Steel Nerve':       'Steel Nerve — third tier. Defense victories.',
	'Immovable':         'Steel Nerve — highest tier. Defense victories.',

	// ── Challenge titles: Precision Strike ──────────────────────────────────
	'Sharpshooter':      'Precision Strike — first tier. Perfect victories.',
	'Surgical':          'Precision Strike — second tier. Perfect victories.',
	'Precision Strike':  'Precision Strike — third tier. Perfect victories.',
	'The Untouchable':   'Precision Strike — highest tier. Perfect victories.',

	// ── Challenge titles: War Veteran ────────────────────────────────────────
	'Tested':            'War Veteran — first tier. Battles fought.',
	'Hardened':          'War Veteran — second tier. Battles fought.',
	'Battle Worn':       'War Veteran — third tier. Battles fought.',
	'War Veteran':       'War Veteran — highest tier. Battles fought.',

	// ── Challenge titles: Blood and Iron ────────────────────────────────────
	'Scarred':               'Blood and Iron — first tier. Defeats endured.',
	'The Bleeding Edge':     'Blood and Iron — second tier. Defeats endured.',
	'Blood and Iron':        'Blood and Iron — third tier. Defeats endured.',
	'The Weight of Command': 'Blood and Iron — highest tier. Defeats endured.',

	// ── Challenge titles: Supply Line ───────────────────────────────────────
	'Supply Runner':         'Supply Line — first tier. Support missions sent.',
	'Logistics Specialist':  'Supply Line — second tier. Support missions sent.',
	'Supply Line':           'Supply Line — third tier. Support missions sent.',
	'Master of Logistics':   'Supply Line — highest tier. Support missions sent.',

	// ── Challenge titles: Territorial Expansion ─────────────────────────────
	'Territory Holder':      'Territorial Expansion — first tier. Nexuses held.',
	'Domain Lord':           'Territorial Expansion — second tier. Nexuses held.',
	'Province Master':       'Territorial Expansion — third tier. Nexuses held.',
	'Territorial Commander': 'Territorial Expansion — highest tier. Nexuses held.',

	// ── Challenge titles: Hegemon ────────────────────────────────────────────
	'Notable':               'Hegemon — first tier. Best galaxy season points.',
	'Power Broker':          'Hegemon — second tier. Best galaxy season points.',
	'Supreme Hegemon':       'Hegemon — highest tier. Best galaxy season points.',

	// ── Challenge titles: First Among Equals ────────────────────────────────
	'Notable Commander':     'First Among Equals — first tier. Best galaxy season points.',
	'Galaxy Power':          'First Among Equals — second tier. Best galaxy season points.',
	'First Among Equals':    'First Among Equals — third tier. Best galaxy season points.',
	'Undisputed':            'First Among Equals — highest tier. Best galaxy season points.',

	// ── Challenge titles: Grand Architect ───────────────────────────────────
	'Armament Chief':        'Grand Architect — first tier. Troops trained lifetime.',
	'Grand Architect':       'Grand Architect — second tier. Troops trained lifetime.',
	'Architect of Ruin':     'Grand Architect — highest tier. Troops trained lifetime.',

	// ── Challenge titles: The Long Game ─────────────────────────────────────
	'Influential':           'The Long Game — first tier. Lifetime influence earned.',
	'Power Player':          'The Long Game — second tier. Lifetime influence earned.',
	'The Long Game':         'The Long Game — third tier. Lifetime influence earned.',
	'Infinite Legacy':       'The Long Game — highest tier. Lifetime influence earned.',

	// ── Challenge titles: Once More Into the Void ───────────────────────────
	'Returning Commander':   'Once More Into the Void — first tier. Galaxies played.',
	'Galaxy Regular':        'Once More Into the Void — second tier. Galaxies played.',
	'Void Walker':           'Once More Into the Void — third tier. Galaxies played.',
	'Endless Crusader':      'Once More Into the Void — highest tier. Galaxies played.',

	// ── Challenge titles: Champion ───────────────────────────────────────────
	'Double Victor':         'Champion — first tier. Galaxies won.',
	'Champion':              'Champion — second tier. Galaxies won.',
	'Grand Champion':        'Champion — third tier. Galaxies won.',
	'Galaxy God':            'Champion — highest tier. Galaxies won.',

	// ── Challenge titles: Rising Star ────────────────────────────────────────
	'Emerging':              'Rising Star — first tier. Best galaxy season points.',
	'Rising Star':           'Rising Star — second tier. Best galaxy season points.',
	'Galaxy Force':          'Rising Star — third tier. Best galaxy season points.',
	'Superstar':             'Rising Star — highest tier. Best galaxy season points.',

	// ── Challenge titles: Opportunist ───────────────────────────────────────
	'Pickpocket':            'Opportunist — first tier. Resources stolen from raids.',
	'Spoils of War':         'Opportunist — second tier. Resources stolen from raids.',

	// ── Challenge titles: Trade Empire ──────────────────────────────────────
	'Merchant':              'Trade Empire — first tier. Total trade volume.',
	'Trade Magnate':         'Trade Empire — second tier. Total trade volume.',
	'Trade Empire':          'Trade Empire — third tier. Total trade volume.',
	'Interstellar Cartel':   'Trade Empire — highest tier. Total trade volume.',

	// ── Challenge titles: Stripped Bare ─────────────────────────────────────
	'Looted':                'Stripped Bare — first tier. Resources lost to raids.',
	'Ransacked':             'Stripped Bare — second tier. Resources lost to raids.',
	'Desolated':             'Stripped Bare — third tier. Resources lost to raids.',
	'Stripped Bare':         'Stripped Bare — highest tier. Resources lost to raids.',

	// ── Challenge titles: Open Market ────────────────────────────────────────
	'Buyer':                 'Open Market — first tier. Trades made on the market.',
	'Regular':               'Open Market — second tier. Trades made on the market.',
	'Market Goer':           'Open Market — third tier. Trades made on the market.',
	'Open Market':           'Open Market — highest tier. Trades made on the market.',

	// ── Challenge titles: Raid Economy ──────────────────────────────────────
	'Pillager':              'Raid Economy — first tier. Resources stolen.',
	'Sacker':                'Raid Economy — second tier. Resources stolen.',
	'Raid Economy':          'Raid Economy — third tier. Resources stolen.',
	'Empire of Spoils':      'Raid Economy — highest tier. Resources stolen.',

	// ── Challenge titles: Ambassador ─────────────────────────────────────────
	'Envoy':                 'Ambassador — first tier. Treaties signed.',
	'Ambassador':            'Ambassador — second tier. Treaties signed.',
	'High Ambassador':       'Ambassador — third tier. Treaties signed.',
	'Architect of Alliances': 'Ambassador — highest tier. Treaties signed.',

	// ── Challenge titles: Long Service ──────────────────────────────────────
	'Veteran Presence':      'Long Service — first tier. Days in service.',
	'Long Service':          'Long Service — second tier. Days in service.',
	'Pillar of the Vex':     'Long Service — highest tier. Days in service.',

	// ── Challenge titles: Word Spreader ─────────────────────────────────────
	'Inviter':               'Word Spreader — first tier. Players referred.',
	'Promoter':              'Word Spreader — second tier. Players referred.',
	'Advocate':              'Word Spreader — third tier. Players referred.',
	'Word Spreader':         'Word Spreader — highest tier. Players referred.',

	// ── Challenge titles: Three Years Strong ────────────────────────────────
	'Seasoned Elder':        'Three Years Strong — first tier. Days in service.',
	'Two-Year Oath':         'Three Years Strong — second tier. Days in service.',
	'Oath Keeper':           'Three Years Strong — third tier. Days in service.',
	'Three Years Strong':    'Three Years Strong — highest tier. Days in service.',

	// ── Challenge titles: First Blood ────────────────────────────────────────
	'Baptised in Fire':      'First Blood — first tier. Attacks launched.',
	'Seasoned':              'First Blood — second tier. Attacks launched.',
	'Battle Hardened':       'First Blood — highest tier. Attacks launched.',

	// ── Challenge titles: Siege Master ──────────────────────────────────────
	'Siege Apprentice':      'Siege Master — first tier. Nexuses captured.',
	'Siege Engineer':        'Siege Master — second tier. Nexuses captured.',
	'Siege Master':          'Siege Master — third tier. Nexuses captured.',
	'Siege Lord':            'Siege Master — highest tier. Nexuses captured.',

	// ── Challenge titles: The Unstoppable ───────────────────────────────────
	'The Unstoppable':       'The Unstoppable — first tier. Victories earned.',
	'Force of Nature':       'The Unstoppable — highest tier. Victories earned.',

	// ── Challenge titles: Collateral Damage ─────────────────────────────────
	'The Grieving':          'Collateral Damage — first tier. Troops lost.',
	'Heavy Losses':          'Collateral Damage — second tier. Troops lost.',
	'Mass Casualty':         'Collateral Damage — third tier. Troops lost.',
	'Collateral Damage':     'Collateral Damage — highest tier. Troops lost.',

	// ── Challenge titles: Death Machine ─────────────────────────────────────
	'Efficient':             'Death Machine — first tier. Troops killed.',
	'Killing Machine':       'Death Machine — second tier. Troops killed.',
	'Death Machine':         'Death Machine — third tier. Troops killed.',
	'Omega Protocol':        'Death Machine — highest tier. Troops killed.',

	// ── Challenge titles: Never Blink ───────────────────────────────────────
	'Alert':                 'Never Blink — first tier. Scout missions conducted.',
	'Watchful':              'Never Blink — second tier. Scout missions conducted.',
	'Never Blink':           'Never Blink — third tier. Scout missions conducted.',
	'Eternal Watch':         'Never Blink — highest tier. Scout missions conducted.',

	// ── Challenge titles: Shadow War ─────────────────────────────────────────
	'Watcher':               'Shadow War — first tier. Scout missions conducted.',
	'Analyst':               'Shadow War — second tier. Scout missions conducted.',
	'Shadow War':            'Shadow War — third tier. Scout missions conducted.',
	'Omniscient':            'Shadow War — highest tier. Scout missions conducted.',

	// ── Challenge titles: Allied Force ──────────────────────────────────────
	'Wingman':               'Allied Force — first tier. Support missions sent.',
	'Reliable Ally':         'Allied Force — second tier. Support missions sent.',
	'Allied Force':          'Allied Force — third tier. Support missions sent.',
	'Coalition Architect':   'Allied Force — highest tier. Support missions sent.',

	// ── Challenge titles: Untouchable ────────────────────────────────────────
	'Near-Perfect':          'Untouchable — first tier. Perfect victories.',
	'Surgical Strike':       'Untouchable — second tier. Perfect victories.',
	'Untouchable':           'Untouchable — third tier. Perfect victories.',
	'Ghost Commander':       'Untouchable — highest tier. Perfect victories.',

	// ── Challenge titles: War Machine (attacks) ──────────────────────────────
	'Aggressive':            'War Machine — first tier. Attacks launched.',
	'Warmonger':             'War Machine — second tier. Attacks launched.',
	'Engine of Destruction': 'War Machine — highest tier. Attacks launched.',

	// ── Challenge titles: Land Grab ──────────────────────────────────────────
	'Landholder':            'Land Grab — first tier. Nexuses held.',
	'Territory Claimer':     'Land Grab — second tier. Nexuses held.',
	'Land Grabber':          'Land Grab — third tier. Nexuses held.',
	'Domain Holder':         'Land Grab — highest tier. Nexuses held.',

	// ── Challenge titles: Forge of War ──────────────────────────────────────
	'Armourer':              'Forge of War — first tier. Troops trained.',
	'Forge Master':          'Forge of War — second tier. Troops trained.',
	'Forge of War':          'Forge of War — third tier. Troops trained.',
	'The Eternal Forge':     'Forge of War — highest tier. Troops trained.',

	// ── Challenge titles: Deep Pockets ──────────────────────────────────────
	'Resourceful':           'Deep Pockets — first tier. Lifetime influence earned.',
	'Affluent':              'Deep Pockets — second tier. Lifetime influence earned.',
	'Deep Pockets':          'Deep Pockets — third tier. Lifetime influence earned.',
	'Infinite Reserves':     'Deep Pockets — highest tier. Lifetime influence earned.',

	// ── Challenge titles: Iron Fist ─────────────────────────────────────────
	'Minor Lord':            'Iron Fist — first tier. Nexuses held simultaneously.',
	'Lord':                  'Iron Fist — second tier. Nexuses held simultaneously.',
	'Iron Fist':             'Iron Fist — third tier. Nexuses held simultaneously.',
	'Absolute Ruler':        'Iron Fist — highest tier. Nexuses held simultaneously.',

	// ── Challenge titles: Perennial ──────────────────────────────────────────
	'Perennial':             'Perennial — first tier. Galaxies played.',
	'The Endless Commander': 'Perennial — highest tier. Galaxies played.',

	// ── Challenge titles: Galaxy Elite ──────────────────────────────────────
	'Noteworthy':            'Galaxy Elite — first tier. Best galaxy season points.',
	'Elite':                 'Galaxy Elite — second tier. Best galaxy season points.',
	'Galaxy Elite':          'Galaxy Elite — third tier. Best galaxy season points.',
	'Transcendent':          'Galaxy Elite — highest tier. Best galaxy season points.',

	// ── Challenge titles: Hall of Fame ──────────────────────────────────────
	'Inscribed':             'Hall of Fame — first tier. Best galaxy season points.',
	'Hall of Fame':          'Hall of Fame — second tier. Best galaxy season points.',
	'Legend':                'Hall of Fame — third tier. Best galaxy season points.',
	'Myth':                  'Hall of Fame — highest tier. Best galaxy season points.',

	// ── Challenge titles: Veteran Commander ─────────────────────────────────
	'Two-Time':              'Veteran Commander — first tier. Galaxies won.',
	'Experienced':           'Veteran Commander — second tier. Galaxies won.',
	'Veteran Commander':     'Veteran Commander — third tier. Galaxies won.',
	'Galactic Elder':        'Veteran Commander — highest tier. Galaxies won.',

	// ── Challenge titles: Pillage Economy ───────────────────────────────────
	'Dependent on Spoils':   'Pillage Economy — first tier. Resources stolen.',
	'Pillage Economy':       'Pillage Economy — second tier. Resources stolen.',
	'Predator State':        'Pillage Economy — third tier. Resources stolen.',
	'Apex Pillager':         'Pillage Economy — highest tier. Resources stolen.',

	// ── Challenge titles: Market Mogul ──────────────────────────────────────
	'Active Trader':         'Market Mogul — first tier. Trades made on the market.',
	'Power Trader':          'Market Mogul — second tier. Trades made on the market.',
	'Market Mogul':          'Market Mogul — third tier. Trades made on the market.',
	'Galactic Exchange':     'Market Mogul — highest tier. Trades made on the market.',

	// ── Challenge titles: Supply Chain ──────────────────────────────────────
	'Supplier':              'Supply Chain — first tier. Total trade volume.',
	'Distributor':           'Supply Chain — second tier. Total trade volume.',
	'Supply Chain':          'Supply Chain — third tier. Total trade volume.',
	'Economic Engine':       'Supply Chain — highest tier. Total trade volume.',

	// ── Challenge titles: Warlord Economics ─────────────────────────────────
	'Opportunistic':         'Warlord Economics — first tier. Resources stolen.',
	'Calculated':            'Warlord Economics — second tier. Resources stolen.',
	'Warlord Economics':     'Warlord Economics — third tier. Resources stolen.',
	'Conquest Capital':      'Warlord Economics — highest tier. Resources stolen.',

	// ── Challenge titles: War Tax ────────────────────────────────────────────
	'Taxed':                 'War Tax — first tier. Resources lost to raids.',
	'Heavily Taxed':         'War Tax — second tier. Resources lost to raids.',
	'War Tax':               'War Tax — third tier. Resources lost to raids.',
	'Bled Dry':              'War Tax — highest tier. Resources lost to raids.',

	// ── Challenge titles: First to Market ───────────────────────────────────
	'Market Entrant':        'First to Market — first tier. Trades made on the market.',
	'Active':                'First to Market — second tier. Trades made on the market.',
	'Market Regular':        'First to Market — third tier. Trades made on the market.',
	'Established Trader':    'First to Market — highest tier. Trades made on the market.',

	// ── Challenge titles: Growth Engine ─────────────────────────────────────
	'Networker':             'Growth Engine — first tier. Players referred.',
	'Growth Driver':         'Growth Engine — second tier. Players referred.',
	'Growth Engine':         'Growth Engine — third tier. Players referred.',
	'Viral Commander':       'Growth Engine — highest tier. Players referred.',

	// ── Challenge titles: Century of Service ────────────────────────────────
	'Month One':             'Century of Service — first tier. Days in service.',
	'Two Months In':         'Century of Service — second tier. Days in service.',
	'Centurion':             'Century of Service — third tier. Days in service.',
	'Bicentennial':          'Century of Service — highest tier. Days in service.',

	// ── Challenge titles: Iron Core ──────────────────────────────────────────
	'Core Member':           'Iron Core — first tier. Days in service.',
	'Cornerstone':           'Iron Core — second tier. Days in service.',
	'Iron Core':             'Iron Core — third tier. Days in service.',
	'The Foundation':        'Iron Core — highest tier. Days in service.',

	// ── Challenge titles: Vex Original ──────────────────────────────────────
	'Early Adopter':         'Vex Original — first tier. Days in service.',
	'First Wave':            'Vex Original — second tier. Days in service.',
	'Genesis Commander':     'Vex Original — highest tier. Days in service.',

	// ── Challenge titles: Network Effect ─────────────────────────────────────
	'Influencer':            'Network Effect — first tier. Players referred.',
	'Network Builder':       'Network Effect — second tier. Players referred.',
	'Network Effect':        'Network Effect — third tier. Players referred.',
	'Galactic Influence':    'Network Effect — highest tier. Players referred.',

	// ── Challenge titles: Apex Combat ────────────────────────────────────────
	'Elite Killer':          'Apex Combat — first tier. Troops killed.',
	'Apex Combat':           'Apex Combat — second tier. Troops killed.',
	'God Slayer':            'Apex Combat — highest tier. Troops killed.',

	// ── Challenge titles: No Retreat ─────────────────────────────────────────
	'Stubborn':              'No Retreat — first tier. Defeats endured.',
	'Refuses to Yield':      'No Retreat — second tier. Defeats endured.',
	'No Retreat':            'No Retreat — third tier. Defeats endured.',
	'The Unbreakable':       'No Retreat — highest tier. Defeats endured.',

	// ── Challenge titles: Supply Mastermind ─────────────────────────────────
	'Logistics Lead':        'Supply Mastermind — first tier. Support missions sent.',
	'Supply Architect':      'Supply Mastermind — second tier. Support missions sent.',
	'Supply Mastermind':     'Supply Mastermind — third tier. Support missions sent.',
	'Logistical Overlord':   'Supply Mastermind — highest tier. Support missions sent.',

	// ── Challenge titles: Empire Eternal ────────────────────────────────────
	'Ambitious':             'Empire Eternal — first tier. Nexuses held simultaneously.',
	'Expansive':             'Empire Eternal — second tier. Nexuses held simultaneously.',
	'Empire Rising':         'Empire Eternal — third tier. Nexuses held simultaneously.',
	'Empire Eternal':        'Empire Eternal — highest tier. Nexuses held simultaneously.',

	// ── Challenge titles: Season Immortal ───────────────────────────────────
	'Breakout Season':       'Season Immortal — first tier. Best galaxy season points.',
	'Dominant Season':       'Season Immortal — second tier. Best galaxy season points.',
	'Historic Season':       'Season Immortal — third tier. Best galaxy season points.',
	'Season Immortal':       'Season Immortal — highest tier. Best galaxy season points.',

	// ── Challenge titles: Conqueror of Worlds ───────────────────────────────
	'World Conqueror':       'Conqueror of Worlds — first tier. Galaxies won.',
	'Serial Victor':         'Conqueror of Worlds — second tier. Galaxies won.',
	'Conqueror of Worlds':   'Conqueror of Worlds — third tier. Galaxies won.',
	'Unstoppable Tide':      'Conqueror of Worlds — highest tier. Galaxies won.',

	// ── Challenge titles: Grand Economy ─────────────────────────────────────
	'Wholesaler':            'Grand Economy — first tier. Total trade volume.',
	'Grand Dealer':          'Grand Economy — second tier. Total trade volume.',
	'Grand Economy':         'Grand Economy — third tier. Total trade volume.',
	'Galactic Trade Network': 'Grand Economy — highest tier. Total trade volume.',

	// ── Challenge titles: Eternal Raider ────────────────────────────────────
	'Persistent Raider':     'Eternal Raider — first tier. Attacks launched.',
	'Relentless Raider':     'Eternal Raider — second tier. Attacks launched.',
	'Eternal Raider':        'Eternal Raider — third tier. Attacks launched.',
	'Raider Incarnate':      'Eternal Raider — highest tier. Attacks launched.',

	// ── Challenge titles: Decade of Loyalty ─────────────────────────────────
	'Committed Servant':     'Decade of Loyalty — first tier. Days in service.',
	'Year One':              'Decade of Loyalty — second tier. Days in service.',
	'Five Years Strong':     'Decade of Loyalty — third tier. Days in service.',

	// ── Challenge titles: Legion of Honor ───────────────────────────────────
	'Sponsor':               'Legion of Honor — first tier. Combined influence of referred players.',
	'Legion of Honor':       'Legion of Honor — second tier. Combined influence of referred players.',
	'Supreme Patron':        'Legion of Honor — highest tier. Combined influence of referred players.',

	// ── Challenge titles: Deathless ──────────────────────────────────────────
	'Near Flawless':         'Deathless — first tier. Perfect victories with zero losses.',
	'Immaculate Record':     'Deathless — second tier. Perfect victories with zero losses.',
	'Deathless':             'Deathless — third tier. Perfect victories with zero losses.',
	'Beyond Reach':          'Deathless — highest tier. Perfect victories with zero losses.',

	// ── Challenge titles: Mentor ─────────────────────────────────────────────
	'Mentor':                'Mentor — first tier. Combined lifetime influence of all referred players.',
	'Master Mentor':         'Mentor — second tier. Combined lifetime influence of all referred players.',
	'Kingmaker':             'Mentor — third tier. Combined lifetime influence of all referred players.',
	'Architect of Empires':  'Mentor — highest tier. Combined lifetime influence of all referred players.',

	// ── Challenge titles: Man Hunter ─────────────────────────────────────────
	'Aggressor':             'Man Hunter — first tier. Unique enemies attacked.',
	'Pursuer':               'Man Hunter — second tier. Unique enemies attacked.',
	'Man Hunter':            'Man Hunter — third tier. Unique enemies attacked.',
	'The Relentless':        'Man Hunter — fourth tier. Unique enemies attacked.',
	'Face of Fear':          'Man Hunter — highest tier. Unique enemies attacked.',

	// ── Challenge titles: Wanted ─────────────────────────────────────────────
	'On the Radar':          'Wanted — first tier. Unique enemies who attacked you.',
	'Wanted':                'Wanted — second tier. Unique enemies who attacked you.',
	'Public Enemy':          'Wanted — third tier. Unique enemies who attacked you.',
	'Most Wanted':           'Wanted — fourth tier. Unique enemies who attacked you.',
	'The Marked One':        'Wanted — highest tier. Unique enemies who attacked you.',

	// ── Challenge titles: Grudge Match ──────────────────────────────────────
	'Known':                 'Grudge Match — first tier. Unique enemies who attacked you.',
	'Notorious':             'Grudge Match — second tier. Unique enemies who attacked you.',
	'Grudge Match':          'Grudge Match — third tier. Unique enemies who attacked you.',
	'The Enemy of All':      'Grudge Match — highest tier. Unique enemies who attacked you.',

	// ── Challenge titles: Nemesis ─────────────────────────────────────────────
	'Rival':                 'Nemesis — first tier. Unique enemies attacked.',
	'Nemesis':               'Nemesis — second tier. Unique enemies attacked.',
	'Arch-Nemesis':          'Nemesis — third tier. Unique enemies attacked.',
	'The Inevitable Fate':   'Nemesis — highest tier. Unique enemies attacked.',

	// ── Challenge titles: Voice of the Faction ──────────────────────────────
	'Communicator':          'Voice of the Faction — first tier. Faction messages sent.',
	'Active Voice':          'Voice of the Faction — second tier. Faction messages sent.',
	'Faction Speaker':       'Voice of the Faction — third tier. Faction messages sent.',
	'Voice of the Faction':  'Voice of the Faction — highest tier. Faction messages sent.',

	// ── Challenge titles: Orator ─────────────────────────────────────────────
	'Chatty':                'Orator — first tier. Faction messages sent.',
	'Vocal':                 'Orator — second tier. Faction messages sent.',
	'Orator':                'Orator — third tier. Faction messages sent.',
	'The Grand Orator':      'Orator — highest tier. Faction messages sent.',

	// ── Challenge titles: The Diplomat ──────────────────────────────────────
	'Negotiator':            'The Diplomat — first tier. Treaties signed.',
	'Diplomat':              'The Diplomat — second tier. Treaties signed.',
	'Grand Diplomat':        'The Diplomat — third tier. Treaties signed.',
	'Peacekeeper':           'The Diplomat — highest tier. Treaties signed.',

	// ── Challenge titles: Faction Veteran ───────────────────────────────────
	'Enlisted':              'Faction Veteran — first tier. Factions joined.',
	'Seasoned Member':       'Faction Veteran — second tier. Factions joined.',
	'Faction Veteran':       'Faction Veteran — third tier. Factions joined.',
	'Eternal Faction Warrior': 'Faction Veteran — highest tier. Factions joined.',

	// ── Challenge titles: Coalition Builder ─────────────────────────────────
	'Alliance Seeker':       'Coalition Builder — first tier. Treaties signed.',
	'Coalition Builder':     'Coalition Builder — second tier. Treaties signed.',
	'Lord of Pacts':         'Coalition Builder — highest tier. Treaties signed.',

	// ── Challenge titles: Faction Loyalist ──────────────────────────────────
	'Affiliated':            'Faction Loyalist — first tier. Factions joined.',
	'Faction Loyalist':      'Faction Loyalist — second tier. Factions joined.',
	'Banner Bearer':         'Faction Loyalist — highest tier. Factions joined.',

	// ── Challenge titles: Daily Grind ───────────────────────────────────────
	'Consistent':            'Daily Grind — first tier. Quest streak days.',
	'Week Warrior':          'Daily Grind — second tier. Quest streak days.',
	'Fortnight Commander':   'Daily Grind — third tier. Quest streak days.',
	'Iron Routine':          'Daily Grind — highest tier. Quest streak days.',

	// ── Challenge titles: Streak Legend ─────────────────────────────────────
	'Unbroken Week':         'Streak Legend — first tier. Quest streak days.',
	'Three Week Run':        'Streak Legend — second tier. Quest streak days.',
	'Streak Legend':         'Streak Legend — third tier. Quest streak days.',
	'The Unbreakable Routine': 'Streak Legend — highest tier. Quest streak days.',

	// ── Challenge titles: Quest Machine ─────────────────────────────────────
	'Diligent':              'Quest Machine — first tier. Quests completed.',
	'Tasked':                'Quest Machine — second tier. Quests completed.',
	'Quest Machine':         'Quest Machine — third tier. Quests completed.',
	'Eternal Operative':     'Quest Machine — highest tier. Quests completed.',

	// ── Challenge titles: Grind Eternal ─────────────────────────────────────
	'Grinder':               'Grind Eternal — first tier. Quests completed.',
	'Mission Veteran':       'Grind Eternal — second tier. Quests completed.',
	'Grind Eternal':         'Grind Eternal — third tier. Quests completed.',
	'The Endless Operative': 'Grind Eternal — highest tier. Quests completed.',

	// ── Challenge titles: Career Total ──────────────────────────────────────
	'Noted Participant':     'Career Total — first tier. Total season points accumulated.',
	'Career Veteran':        'Career Total — second tier. Total season points accumulated.',
	'Career Force':          'Career Total — third tier. Total season points accumulated.',
	'Career Total':          'Career Total — highest tier. Total season points accumulated.',

	// ── Challenge titles: Scoreboard Titan ──────────────────────────────────
	'Scorer':                'Scoreboard Titan — first tier. Best galaxy season points.',
	'Scoreboard Regular':    'Scoreboard Titan — second tier. Best galaxy season points.',
	'Scoreboard Titan':      'Scoreboard Titan — third tier. Best galaxy season points.',
	'The Unapproachable':    'Scoreboard Titan — highest tier. Best galaxy season points.',

	// ── Challenge titles: The Widowmaker ────────────────────────────────────
	'Dangerous':             'The Widowmaker — first tier. Troops killed.',
	'Lethal':                'The Widowmaker — second tier. Troops killed.',
	'The Widowmaker':        'The Widowmaker — third tier. Troops killed.',
	'Harbinger of Ruin':     'The Widowmaker — highest tier. Troops killed.',

	// ── Challenge titles: Tide of Battle ────────────────────────────────────
	'In the Fray':           'Tide of Battle — first tier. Attacks launched.',
	'Tide Rider':            'Tide of Battle — second tier. Attacks launched.',
	'Tide of Battle':        'Tide of Battle — third tier. Attacks launched.',
	'The War Itself':        'Tide of Battle — highest tier. Attacks launched.',

	// ── Challenge titles: Scarred Veteran ───────────────────────────────────
	'Bloodied Commander':    'Scarred Veteran — first tier. Defeats endured.',
	'Scarred Veteran':       'Scarred Veteran — second tier. Defeats endured.',
	'The Walking Wound':     'Scarred Veteran — highest tier. Defeats endured.',

	// ── Challenge titles: Iron Discipline ───────────────────────────────────
	'Disciplined':           'Iron Discipline — first tier. Perfect victories.',
	'Iron Discipline':       'Iron Discipline — second tier. Perfect victories.',
	'Zero Tolerance':        'Iron Discipline — third tier. Perfect victories.',
	'The Perfect Commander': 'Iron Discipline — highest tier. Perfect victories.',

	// ── Challenge titles: Eyes Everywhere ───────────────────────────────────
	'Informed':              'Eyes Everywhere — first tier. Scout missions conducted.',
	'Eyes Everywhere':       'Eyes Everywhere — second tier. Scout missions conducted.',
	'Omniscient Commander':  'Eyes Everywhere — highest tier. Scout missions conducted.',

	// ── Challenge titles: Industrial Complex ────────────────────────────────
	'Armament Depot':        'Industrial Complex — first tier. Troops trained.',
	'War Factory':           'Industrial Complex — second tier. Troops trained.',
	'Industrial Complex':    'Industrial Complex — third tier. Troops trained.',
	'Planet Forge':          'Industrial Complex — highest tier. Troops trained.',

	// ── Challenge titles: Ghost Empire ──────────────────────────────────────
	'Shadow Presence':       'Ghost Empire — first tier. Scout missions conducted.',
	'Ghost Power':           'Ghost Empire — second tier. Scout missions conducted.',
	'Ghost Empire':          'Ghost Empire — third tier. Scout missions conducted.',
	'The Invisible Hand':    'Ghost Empire — highest tier. Scout missions conducted.',

	// ── Challenge titles: Warlord of Nexuses ────────────────────────────────
	'Regional Commander':    'Warlord of Nexuses — first tier. Nexuses held simultaneously.',
	'Strategic Commander':   'Warlord of Nexuses — second tier. Nexuses held simultaneously.',
	'Warlord of Nexuses':    'Warlord of Nexuses — third tier. Nexuses held simultaneously.',
	'Galactic Overlord':     'Warlord of Nexuses — highest tier. Nexuses held simultaneously.',

	// ── Challenge titles: Cartels ────────────────────────────────────────────
	'Corner Dealer':         'Cartels — first tier. Total trade volume.',
	'Cartel Associate':      'Cartels — second tier. Total trade volume.',
	'Cartel Boss':           'Cartels — third tier. Total trade volume.',
	'Cartels':               'Cartels — highest tier. Total trade volume.',

	// ── Challenge titles: Spoils of Victory ─────────────────────────────────
	'Spoils Collector':      'Spoils of Victory — first tier. Resources stolen.',
	'Spoils of Victory':     'Spoils of Victory — second tier. Resources stolen.',
	'Conquest Banker':       'Spoils of Victory — highest tier. Resources stolen.',

	// ── Challenge titles: Economic Warfare ──────────────────────────────────
	'Economic Raider':       'Economic Warfare — first tier. Resources stolen.',
	'Economic Aggressor':    'Economic Warfare — second tier. Resources stolen.',
	'Economic Warfare':      'Economic Warfare — third tier. Resources stolen.',
	'Destroyer of Economies': 'Economic Warfare — highest tier. Resources stolen.',

	// ── Challenge titles: Price Gouger ──────────────────────────────────────
	'Volume Trader':         'Price Gouger — first tier. Total trade volume.',
	'Price Setter':          'Price Gouger — second tier. Total trade volume.',
	'Price Gouger':          'Price Gouger — third tier. Total trade volume.',
	'Market Dictator':       'Price Gouger — highest tier. Total trade volume.',

	// ── Challenge titles: Blood Money ───────────────────────────────────────
	'Profiteer':             'Blood Money — first tier. Resources stolen.',
	'Blood Money':           'Blood Money — second tier. Resources stolen.',
	'War Treasury':          'Blood Money — third tier. Resources stolen.',
	'The Crimson Vault':     'Blood Money — highest tier. Resources stolen.',

	// ── Challenge titles: All Time Great ────────────────────────────────────
	'Well Known':            'All Time Great — first tier. Total season points accumulated.',
	'All Time Great':        'All Time Great — second tier. Total season points accumulated.',
	'Living Monument':       'All Time Great — highest tier. Total season points accumulated.',

	// ── Challenge titles: Serial Winner ─────────────────────────────────────
	'Back to Back':          'Serial Winner — first tier. Galaxies won.',
	'Serial Winner':         'Serial Winner — second tier. Galaxies won.',
	'Dynasty Maker':         'Serial Winner — highest tier. Galaxies won.',

	// ── Challenge titles: Comeback Kid ──────────────────────────────────────
	'Returned':              'Comeback Kid — first tier. Galaxies played.',
	'Comeback Kid':          'Comeback Kid — second tier. Galaxies played.',
	'Never Say Die':         'Comeback Kid — highest tier. Galaxies played.',

	// ── Challenge titles: The Patron ────────────────────────────────────────
	'Backer':                'The Patron — first tier. Combined influence of referred players.',
	'The Patron':            'The Patron — second tier. Combined influence of referred players.',
	'Legacy Builder':        'The Patron — third tier. Combined influence of referred players.',
	'Empire by Proxy':       'The Patron — highest tier. Combined influence of referred players.',

	// ── Challenge titles: Living Legend ─────────────────────────────────────
	'Established':           'Living Legend — first tier. Lifetime influence earned.',
	'Year One Legend':       'Living Legend — second tier. Lifetime influence earned.',
	'Eternal Presence':      'Living Legend — highest tier. Lifetime influence earned.',

	// ── Challenge titles: The Godfather ─────────────────────────────────────
	'The Godfather':         'The Godfather — first tier. Combined influence of referred players.',
	'Father of the Galaxy':  'The Godfather — highest tier. Combined influence of referred players.',

	// ── Challenge titles: Never Offline ─────────────────────────────────────
	'Reliable':              'Never Offline — first tier. Quest streak days.',
	'Always On':             'Never Offline — second tier. Quest streak days.',
	'Never Offline':         'Never Offline — third tier. Quest streak days.',
	'The Eternal Operator':  'Never Offline — highest tier. Quest streak days.',

	// ── Skirmisher (missing from Butcher block above) ────────────────────────
	'Skirmisher':            'Butcher — entry tier. Troops eliminated in combat.',
};
