-- ============================================================
-- Planet'Claim — Import du suivi des dossiers sinistres
-- À exécuter APRÈS 0021_claim_vocabulaire.sql, dans SQL Editor.
--
-- Source : « Suivi_Dossiers_Sinistres_PlanetAura.xlsx », onglet
-- « Suivi dossiers ». Statuts, types et urgences repris tels quels de
-- l'onglet « Listes » du classeur.
--
-- Les lignes de gabarit du tableur (formule « S_ » sans n° d'expédition)
-- sont ignorées : seuls les dossiers réels sont importés.
--
-- REJOUABLE : l'import se fait sur le n° de dossier (colonne `ref`). Le
-- relancer met à jour les dossiers déjà importés au lieu de créer des
-- doublons, et ne touche jamais aux dossiers créés dans l'application.
-- ============================================================

insert into public.claims (
  ref, created_at, status, priority, category, title, description,
  client_nom, client_email, client_tel, pays,
  shipping_ref, adherent, date_expedition, date_livraison, valeur_commande,
  carrier, tracking_number, lien_suivi, lien_transporteur,
  date_incident, nb_bouteilles, montant_estime, lien_drive,
  reserves, lrar_le, ar_le, reponse_transporteur,
  cf_declaration, cf_dossier, cf_interlocuteur, cf_statut, cf_relance,
  montant_propose, date_accord, montant_recupere, date_versement,
  prochaine_action, action_echeance, notes, assureur
) values
  ('S_8663', '2026-07-28 09:00:00+00', 'Refusé / Sans suite', 'Normal', 'Casse totale', 'Casse totale — VAN GORDER CHRIS — expédition 8663', 'Destruction du colis en douane', 'VAN GORDER CHRIS', 'csvangorder@gmail.com', '2488219513', 'États-Unis - Michigan - Direct', '8663', 'CHATEAU FORTIA', '2026-06-29', null, 232.5, 'UPS', '1Z80X8R0DH90717773', '', '', '2026-07-28', 6, 392.5, 'https://drive.google.com/drive/folders/1Ru09TQNpDEMdjhapsOBFQA9JqTwaZoUC?usp=sharing', '', null, null, '', null, '', '', 'Transmis Coste Fermon', null, 0, null, 0, null, '28/07: Recla CF + mail recla UPS Fait 
31/07: RXP faite ? Domaine prevenu ?', null, '31/07: PAs pris en charge pas CF', 'Coste Fermon'),
  ('S_5925', '2026-05-20 09:00:00+00', 'Refusé / Sans suite', 'Normal', 'Casse partielle', 'Casse partielle — OGE LINDA — expédition 5925', '', 'OGE LINDA', 'lindakoge@gmail.com', '3372784121', 'États-Unis - Louisiane - Groupage', '5925', 'PLANET PROVENCE', '2026-05-13', '2026-05-15', 119.6, 'UPS', '1Z8593X5A806082120', 'https://www.ups.com/track?loc=fr_FR&tracknum=1Z8593X5A806082120&requester=ST/trackdetails', '', '2026-05-20', 0, 0, '', '', null, null, '', '2026-05-21', 'TP2635178CA', 'Isabelle MIRAL', 'Refusé / Sans suite', null, 0, null, 0, null, 'REMPLIR CLAIM SUR WS + Mail envoyé à Ian pour savoir s''il y a des bouteilles intactes + demande de photos du colis
Att retour de Ian pour remplir la claim auprès de WS
08/07: Relance Ian + Aless', null, 'La cliente demande une RXP complete. Pas de RXP partielle', 'Coste Fermon'),
  ('S_7427', '2026-06-08 09:00:00+00', 'Refusé / Sans suite', 'Normal', 'Casse partielle', 'Casse partielle — DUNN PATRICK — expédition 7427', 'Le client signale 4 bouteilles endommagées par la chaleur.', 'DUNN PATRICK', 'patrickrdunn@gmail.com', '6504180507', 'États-Unis - Nevada - Direct', '7427', 'CHATEAU FORTIA', '2026-05-26', null, 820.84, 'UPS', '1Z80X8R0DA93685510', 'https://www.ups.com/track?loc=fr_FR&requester=ST/trackdetails', '', '2026-06-08', 4, 209.71, 'https://drive.google.com/drive/folders/1feMZxRGauie7Kv05tLdsE9-T9VxBSQTr?usp=sharing', 'Non', null, null, '', '2026-06-08', 'TP2635327CA', 'Isabelle MIRAL', 'Refusé / Sans suite', null, 0, null, 0, null, '08-/06: En att de savoir si CF peut nous couvrir pour des bouchons sortants à cause de la chaleur.', null, 'Réponse CF Dans ce dossier il n’y a pas de dommages et nous ne pouvons malheureusement pas intervenir.
17/06: rxp en cours vu avec Flo - Transport pour PA et bouteilles a la charge du domaine', 'Coste Fermon'),
  ('S_6808', '2026-06-23 09:00:00+00', 'Refusé / Sans suite', 'Normal', 'Casse partielle', 'Casse partielle — WOLF MATTHEW — expédition 6808', '1 bouteille cassée durant le transport last miles', 'WOLF MATTHEW', 'matthew.wolf2@gmail.com', '31 07 21 87 28', 'États-Unis - Californie - Groupage', '6808', 'CAVE ARTHUS ET JEAN', '2026-06-12', null, 292.16, 'UPS', '1Z8593X5A800875883', '', '', '2026-06-23', 1, 7.73, 'https://drive.google.com/drive/folders/1egw1Hc1MrlGbTJrvUgR8PoAdL40w3A-3?usp=sharing', '', null, null, '', '2026-06-24', '', '', 'Refusé / Sans suite', null, 0.0, '2026-07-30', 0, null, '23/06 Sarah: Dommage signalé par UPS - Mail envoyé au client avec domaine en CC pour savoir si des bouteilles ont été endomagées  + Mail a WeShip pour voir s''ils en savent plus
En att du retour de WS + Client + Domaine

24/06 Sarah: Le client signale 1 bouteille cassée ( Sur le Cailloux - 7,73€ ) + Demande de remboursement 

08/07: Adresse paypal demandé au client pour faire le remboursement', null, 'A réception de la réponse à la réclamation faite au transporteur nous pourrons procéder à l’indemnisation.

Penser à prevenir CF dès que nous serons indemnisés par UPS

24/07: Payé par WeShip 128,81 $ - 113,29 €

30/07: Réponse de CF: Nous comprenons que vous avez obtenu une indemnisation de la totalité du recours, nous classons donc le dossier sans suite.', 'Coste Fermon'),
  ('S_7332', '2026-05-28 09:00:00+00', 'Refusé / Sans suite', 'Normal', 'Casse partielle', 'Casse partielle — IMBAUD MARC — expédition 7332', 'Le client n''a reçu que 5 bouteilles sur les 6 du colis.', 'IMBAUD MARC', 'mimbaud@gmail.com', '615941563', 'Pays-Bas', '7332', 'CHATEAU DE BREGANCON', '2026-05-21', '2026-05-26', 127.17, 'UPS', '1Z80X8R0DL95166094', 'https://www.ups.com/track?loc=fr_FR&requester=ST/trackdetails', '', '2026-05-27', 1, 20.3, 'https://drive.google.com/drive/folders/1UcmcTHJOOZfMKRtsTbMhFpJyiu4U64i_?usp=sharing', 'Non', null, null, 'Oui', '2026-05-28', 'TP2635257CA', 'Isabelle MIRAL', 'Transmis Coste Fermon', '2026-06-23', 0.0, null, 0, null, '08/06: Demande de photo du colis par UPS - Photo envoyée
24/06: Récla UPS acceptée -
08/07: Dossier renvoyé a UPS', null, '28/05: Mail Coste + Mail UPS faits. 
17/06: Refus d''UPS - Mail envoyé pour savoir pourquoi
Eu Erika au téléphone - Va nous envoyer la facture + va voir avec le client si RXP ou remboursement
24/06: Recu la facture - Ajoutée au dossier partagé du sininstre
30/07: UPS rembourse 17,83', 'Coste Fermon'),
  ('S_7195', '2026-05-21 09:00:00+00', 'Accord assureur', 'Normal', 'Casse partielle', 'Casse partielle — EVANS DEBRA — expédition 7195', 'Dommage signalé sur le colis', 'EVANS DEBRA', 'DP-EVANS@COMCAST.NET', '8412544233', 'États-Unis - Illinois - Groupage', '7195', 'O CHATEAU', '2026-05-18', null, 130.0, 'UPS', '1Z80X8R06895853082', 'https://www.ups.com/track?loc=fr_FR&tracknum=1Z80X8R06895853082&requester=ST/trackdetails', '', '2026-05-21', 1, 72.41, 'https://drive.google.com/drive/folders/12frLMA5hzlEUlI_Oi_vtJmoFCAz581To?usp=drive_link', 'Non', null, null, '', '2026-05-21', 'TP2635193CA', 'Isabelle MIRAL', 'Accord assureur', null, 72.41, '2026-05-28', 0, null, '08/06: en att retour UPS - Recla remplie', null, '22/05: Récla UPS remplie
02/06: UPS relancé
08/07: Relance UPS pour connaitre la date et le montant de l''indemnisation
09/07: UPS confirme un paiement déjà éffefctué de 40€', 'Coste Fermon'),
  ('S_7200', '2026-05-29 09:00:00+00', 'Accord assureur', 'Normal', 'Perte', 'Perte — TILLMAN STANLEY — expédition 7200', '', 'TILLMAN STANLEY', 'donnatillman@comcast.net', '9045095699', 'États-Unis - Floride - Groupage', '7200', 'DOMAINE DALMERAN', '2026-05-19', null, 447.5, 'UPS', '1Z80X8R06899035986', 'https://www.ups.com/track?tracknum=1Z80X8R06896964979&loc=fr_FR&requester=QUIC%2F/trackdetails', '', '2026-05-28', 6, 129.96, 'https://drive.google.com/drive/folders/1EmneyUkSMP8gBRw5kJ2g7zyMhJjXW8uQ?usp=sharing', 'Non', null, null, '', '2026-05-29', 'TP2635104CA', 'Isabelle MIRAL', 'Accord assureur', null, 100.0, '2026-06-01', 100.0, null, '08/06: En att retour claim UPS
08/07: Relance UPS pour connaitre la date et le montant de l''indemnisation', null, '29/05:
-RXP du colis le 01/06 depuis le domaine
-Remboursement des bouteilles au domaine 
-Recla UPS en cours
11/06: Document a signer pour l''indemnisation', 'Coste Fermon'),
  ('S_7327', '2026-06-02 09:00:00+00', 'Clôturé', 'Normal', 'Casse partielle', 'Casse partielle — Martens Doug — expédition 7327', '1 colis endommagé sur les 5 lors du transit entre le domaine et chez nous à Castres.
Contenu du colis: 
7 Zéro dosage de Meuniers 0.75 
2 Cuvée Trianon 0.75
3 Cuvée Trianon 1.5', 'Martens Doug', 'bghomebuilder@gmail.com', '2702021797', 'États-Unis - Kentucky - Groupage', '7327', 'Champagne Roger-Constant Lemaire', '2026-05-27', null, 2439.0, 'UPS', '1Z80X8R06892904148', 'https://www.ups.com/track?loc=fr_FR&requester=ST/trackdetails', '', '2026-05-29', 12, 254.89, 'https://drive.google.com/drive/folders/1ZJkQFpFavUqyXaaeP7tQWr24OCLKh_VB?usp=sharing', 'Non', null, null, '', '2026-06-02', 'TP2635315CA', 'Isabelle MIRAL', 'Clôturé', null, 0, null, 17.83, null, '02/06: Voir si domaine souhaite faire une RXP
08/06/ Merci de noter que le délai de paiement, une fois le dossier finalisé, est de 15 jours ouvrables.
08/07: Relance UPS pour connaitre la date et le montant de l''indemnisation', null, 'Sinistre survenu dans le transit Domaine -> castres.
Un colis de 12 endommagé.

Colis retrouvé par UPS

07/08: UPS annonce un paiement de 403,79 € payé le 15/06/26', 'Coste Fermon'),
  ('S_6207', '2026-06-01 09:00:00+00', 'Clôturé', 'Normal', 'Casse totale', 'Casse totale — MARINESCU SORIN — expédition 6207', 'Marchandise totalement jetée par le transporteur', 'MARINESCU SORIN', 'sorinmarinescu17@gmail.com', '5085234420', 'États-Unis - Massachusetts - Groupage', '6207', 'TOURS IN CHAMPAGNE', '2026-05-11', null, 264.0, 'UPS', '1Z8593X5A828135460', 'https://www.ups.com/track?loc=fr_FR&requester=ST/trackdetails', '', '2026-05-29', 12, 464.0, 'https://drive.google.com/drive/folders/1pQpffdcYuV7Gmm3OSTC9x97Ta3wbQ1Sd?usp=sharing', 'Non', null, null, 'Oui', '2026-06-01', '', 'Isabelle MIRAL', 'Clôturé', null, 0, null, 102.29, null, '08/07: Relance WS faite - 
24/07: Claim WS approuvée 118,63 $ //', null, 'NE PAS TRANSMETTRE A CF - COMMANDE D''AVRIL', 'Coste Fermon'),
  ('S_6410', '2026-06-05 09:00:00+00', 'Clôturé', 'Normal', 'Perte', 'Perte — MOSELEY KIMBERLY — expédition 6410', 'Colis perdu par UPS durant son transit en le Domaine et Castres', 'MOSELEY KIMBERLY', 'kimberlyrc3@gmail.com', '8046875621', 'États-Unis - Tennessee - Groupage', '6410', 'LE REPAIRE DE BACCHUS', '2026-05-12', null, 297.33, 'UPS', '1Z80X8R06891845955', 'https://www.ups.com/track?loc=fr_FR&requester=ST/trackdetails', '', '2026-05-21', 6, 307.3, 'https://drive.google.com/drive/folders/1vGL0t2Z74JI8zDuynpoKDtpiAntBvCzf?usp=sharing', 'Non', null, null, 'Oui', '2026-06-05', 'TP2635323CA', 'Isabelle MIRAL', 'Clôturé', null, 0, null, 0, null, '08/07: Relance UPS pour connaitre la date et le montant de l''indemnisation

10/07: Investigation cloturée - En cours d''inspection pour indemnisation', null, 'NE PAS TRANSMETTRE A CF - COMMANDE D''AVRIL', 'Coste Fermon'),
  ('S_6567', '2026-06-08 09:00:00+00', 'Clôturé', 'Normal', 'Autre', 'Autre — JOHNSON TONY — expédition 6567', 'Colis en RTS - Voir avec WS ce qu''il en est exactement', 'JOHNSON TONY', 'tony.johnson@edwardjones.com', '4079289552', 'États-Unis - Floride - Groupage', '6567', 'PLANET PROVENCE', '2026-06-02', null, 745.5, 'UPS', '1Z8593X5A807358661', 'https://www.ups.com/track?loc=fr_FR&requester=ST/trackdetails', '', '2026-06-08', 0, 0, 'https://drive.google.com/drive/folders/1c2VTaA3y-4AprpeJ1Dx7WVF4jPVPbQPk?usp=sharing', 'Non', null, null, 'En cours', null, '', 'Isabelle MIRAL', 'Clôturé', null, 0, null, 0, null, '12/06: RECLA WS OK
08/07: Relance WS faite -', null, 'NE PAS TRANSMETTRE A CF - COMMANDE D''AVRIL
17/06: WS relancé pour la recla', 'Coste Fermon'),
  ('S_7240', '2026-06-26 09:00:00+00', 'Clôturé', 'Normal', 'Coulage / fuite', 'Coulage / fuite — MILLER ADAM — expédition 7240', '1 BOUTEILLE qui a fuit - 1 bouteille Fiancée', 'MILLER ADAM', 'adammiller9324@gmail.com', '9048919324', 'États-Unis - Floride - Groupage', '7240', 'DOMAINE LA BARROCHE', '2026-06-22', null, 155.29, 'UPS', '1Z8593X5A836536404', '', '', '2026-06-26', 1, 57.05, 'https://drive.google.com/drive/folders/1LPgreRvBQWwimOtgDxz5c7qfT3l1OLeX?usp=sharing', '', null, null, '', null, '', '', '', null, 0, null, 0, null, '26/06 FAIRE RECLLA UPS AVEC SARAH -SW

08/07: Dommage lié à la chaleur - non couvert par assurance - Vu avec Flo, on fait quand même la RXP a nos frais - 
Je tente la récla UPS au cas ou', null, '08/07: Dommage lié à la chaleur - non couvert par assurance - Vu avec Flo, on fait quand même la RXP a nos frais - 
Je tente la récla UPS au cas ou 

09/07: UPS refuse la récla pour délai de réclamation dépassé. Je tente d''insister en leur disant que je les ai informé dès que j''ai eu connaissance du sinistre.', 'Coste Fermon'),
  ('S_8226', now(), 'Nouveau', 'Normal', 'Perte', 'Perte — Victor Arnaud — expédition 8226', 'Perte d''un colis de champagne - Recla faite pour Victor, au cas ou son assureur demanderait des docs.', 'Victor Arnaud', 'victor@kevinetvictor.com', '686073954', 'France', '8226', 'VINSCOEUR', null, null, 2203.0, 'UPS', '1Z80X8R0DL94164570', '', '', null, 12, 1000.0, '', '', null, null, '', null, '', '', '', null, 0, null, 0, null, '', null, 'Ne pas transmettre a CF - Colis pas assuré -

UPS 10/07: Je vous remercie de votre retour. Je viens de lancer l''enquête et je vous informe que le délai de l''investigation peut aller jusqu''à 10 jours ouvrables.
23/07 : relance UPS + 8,33 DTS /KG proposé à Vinscoeur
Vinscoeur demande à ce qu''on lui envoie le doc ups de claim une fois disponible', 'Coste Fermon'),
  ('S_9017', '2026-07-31 09:00:00+00', 'Nouveau', 'Normal', 'Casse partielle', 'Casse partielle — LARSEN ALEKSANDER LEONARD — expédition 9017', '1 bouteille cassée  Yquem 2023 58,33€', 'LARSEN ALEKSANDER LEONARD', 'aleksander@stendr.com', '4797020990', 'Norvège - Sud', '9017', 'Winetailors', '2026-07-21', '2026-07-31', 699.96, 'FedEx', '874471872042', '', '', null, 1, 58.33, '', '', null, null, '', null, '', '', '', null, 0, null, 0, null, '', null, '', 'Coste Fermon'),
  ('S_6093', now(), 'Nouveau', 'Normal', 'Perte', 'Perte — FARRIS RAENANA — expédition 6093', '', 'FARRIS RAENANA', 'rfarris@lrs.com', '2177252067', 'États-Unis - Illinois - Groupage', '6093', 'DOMAINE DE LA CITADELLE', '2026-04-24', null, 0, 'Autre', 'UDS1385106051', '', '', null, 6, 0, '', '', null, null, '', null, '', '', '', null, 0, null, 0, null, '31/07: RXP a plannifer avec le domaine.', null, '', 'Coste Fermon'),
  ('S_7210', '2026-06-02 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Perte', 'Perte — KUCZKA Kathy — expédition 7210', 'Colis perdu par UPS durant son transit en le Domaine et Castres', 'KUCZKA Kathy', 'kathykuczka@gmail.com', '7706528774', 'États-Unis - Georgie - Groupage', '7210', 'CLOS DU CALVAIRE', '2026-05-18', null, 390.0, 'UPS', '1Z80X8R06891583014', 'https://www.ups.com/track?loc=fr_FR&requester=ST/trackdetails', '', '2026-06-01', 12, 408.94, 'https://drive.google.com/drive/folders/1iYFbu90-BmKmBRaI1fNcX5Ao0qTydEXE?usp=sharing', 'Non', null, null, 'Oui', '2026-06-02', 'TP2635317CA', 'Isabelle MIRAL', 'Transmis Coste Fermon', '2026-06-23', 0, null, 390.0, '2026-06-25', '02/06: En att retour Domaine + Client pour savoir si on fait une RXP ou un remboursement 
05/06: Client souhaite attendre la déclaration de perte officielle d''UPS
18/06: La cliente préfére attendre que les températures redescendent pour faire la RXP. 
Recu la facture - Voir avec Flo
19/06: Cliente demande RXP mi-septembre', null, 'Sinistre survenu dans le transit Domaine -> castres.
Un colis de 12 perdu.
Client et Domaine informés
5/06: Eu Coralie au tél pour faire une RXP - Doit me rap pour le confirmer 
17/06: UPS confirme la perte - Dossier récla rempli + Mail domaine pour savoir si RXP 25/06 UPS indemnisation 390 €', 'Coste Fermon'),
  ('S_7015', '2026-06-08 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Casse partielle', 'Casse partielle — DEITCHMAN JON — expédition 7015', 'Colis en RTS - Voir avec WS ce qu''il en est exactement - Prevenir Domaine et surtout pas client !!!', 'DEITCHMAN JON', 'jodeitchman@gmail.com', '7038509626', 'États-Unis - Virginie - Groupage', '7015', 'TOURS IN CHAMPAGNE', '2026-06-02', null, 200.0, 'UPS', '1Z8593X5A830240494', 'https://www.ups.com/track?loc=fr_FR&requester=ST/trackdetails', '', '2026-06-08', 6, 330.0, 'https://drive.google.com/drive/folders/1-Rpw6cU6duExgRRXxVG5qnNdFv4sJNiX?usp=sharing', 'Non', null, null, '', '2026-06-17', 'TP2635530CA', 'Céline Combes', 'Transmis Coste Fermon', '2026-06-23', 0, null, 0, null, '25/06: Transmettre photos du colis et des bouteilles a Coste Fermon dès que Ian nous les enverra

08/07: Relance claim WS faite. 
Relance Ian pour les photos

09/07: Aless a envoyé les bouteilles en photo. Il manque :
Dumont Blanc de blancs Solera x 1 / 30 €
Dumont Mailly Grand cru x 1 / 35 €

24/04: Claim approved by WeShip : 125,18 $ // 110,10 €
Information transmise a CF + capture d''ecran enregistrée dans le dossier', null, '12/06: RECLA WS OK - DOMAINE PREVENU
17/06: Domaine demande RXP à partir du 19/06.
Dossier transmis Coste Fermon', 'Coste Fermon'),
  ('S_8135', '2026-06-16 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Casse partielle', 'Casse partielle — CAMILLE LENORMAND — expédition 8135', 'Colis en RTS - Le client demande une RXP le jour même.', 'CAMILLE LENORMAND', 'c.lenormand@jurisdrone.com', '652166622', 'France', '8135', 'LA CAVE DES TUILERIES', '2026-06-15', null, 195.0, 'UPS', '1Z80X8R0DL97014342', 'https://www.ups.com/track?loc=fr_FR&requester=ST/trackdetails', '', '2026-06-17', 1, 32.5, 'https://drive.google.com/drive/folders/1-0KUqlEC1083o8CCqj6r0Gso4dpqXE1z?usp=sharing', '', null, null, '', '2026-06-17', 'TP2635526CA', 'Céline Combes', 'Transmis Coste Fermon', '2026-06-23', 0, null, 0, null, '08/07: Dossier d''indemnisation UPS rempli et retourné
En att de la facture client', null, '17/06: RXP ce jour demandé par le domaine apr mail à une nouvelle adresse de livraison car sa cliente n''est plus à même adresse. 

10/07: Je vous laisse revenir vers nous à réception :

- De la facture litige

- De la demande d’indemnisation

- La réponse du transporteur à votre demande d’indemnisation ;', 'Coste Fermon'),
  ('S_8128', '2026-06-23 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Casse totale', 'Casse totale — LA CHAPELLE AUX VINS THIERRY GOUBAN — expédition 8128', 'La bouteille a été endomagée - UPS a jeté toute la marchandise.', 'LA CHAPELLE AUX VINS THIERRY GOUBAN', 'thierry.gouban@gmail.com', '668435842', 'France', '8128', 'LA MAISON GABIN', '2026-06-15', null, 133.8, 'UPS', '1Z80X8R0DL99123300', '', '', '2026-06-23', 1, 99.0, 'https://drive.google.com/drive/folders/1wh8pqViVqUXYNG6idykPlEW09RTKVd_N?usp=sharing', '', null, null, 'Oui', '2026-06-25', '', '', 'Transmis Coste Fermon', '2026-06-23', 0, null, 0, null, '23/06:  Malheureusement, votre emballage ne respectait pas ces
instructions. UPS ne peut être tenu responsable de toute avarie ou dégât survenant à un quelconque
colis s''il n''est pas correctement emballé.
23/06 Sarah: Mail envoyé à UPS afin de lancer une réclamation et leur expliquer que tous nos emballages respectent les normes. 
Mail Bo Casse totale envoyé

24/06 Sarah: Le domaine indique avoir planifié la RXP depuis le producteur directement. 

24/06 Sarah: UPS réponds que la réclamation a été acceptée - Les docs de remboursement vont nous parvenir

07/08: Dossier UPS rempli et retourné.', null, '07/07: Pas recu les docs d''UPS à compléter - UPS relancé par mail. 

10/07: Nous avons bien pris note que vous êtes dans l’attente du remboursement d’UPS.', 'Coste Fermon'),
  ('S_8059', '2026-06-23 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Casse partielle', 'Casse partielle — ESPEJO JOSE ANTONIO — expédition 8059', '2 BOUTEILLES CASSEES DANS LE TRANSPORT SIGNALE PAR LE CLIENT
2 x Vouvray de Chanceny d''une valeur de 7.17€ chacune', 'ESPEJO JOSE ANTONIO', 'espejoja@gmail.com', '610269302', 'Espagne', '8059', 'MAISON DU VOUVRAY SARL', '2026-06-19', null, 467.08, 'FedEx', '872888870205', '', '', null, 2, 81.01, 'https://drive.google.com/drive/folders/1l6-41VOA2NrU2CZStgWpKfI7Z0GyJ9A5?usp=sharing', 'Non', null, null, '', '2026-06-30', 'TP2635318CA', '', 'Transmis Coste Fermon', '2026-07-07', 0, null, 0, null, '23/06 Sarah: Sinistre signalé sur 2 bouteilles Vouvray de Chanceny par le domaine
Eu client en tel, ok pour RXP après épisode de canicule. 
Le domaine nous enverra la facture au moment de la RXP 

24/06: Recontacter le domaine dès que nous reprenons les envois.', null, '', 'Coste Fermon'),
  ('S_7184', '2026-06-30 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Perte', 'Perte — RICKETTS MARK — expédition 7184', 'Colis perdu par UPS entre notre entrpot de New York et le destinataire final.', 'RICKETTS MARK', 'colonel.ricketts@gmail.com', '86 09 92 47 02', 'États-Unis - Connecticut - Groupage', '7184', 'FAMILLE NEGREL SAS', '2026-06-12', null, 236.23, 'UPS', '1Z8593X5A835968593', '', '', '2026-06-24', 12, 432.5, 'https://drive.google.com/drive/folders/1IK4c4Gdc11h7wJnGuCS6dOuWuWgt3YD3?usp=sharing', 'Non', null, null, '', '2026-07-08', 'TP2635781CA', 'Céline Combes', 'Transmis Coste Fermon', null, 0, null, 0, null, '08/07: Dossier CF monté et transmis + claim WS faite - En att retour 

16/07: Package found and out for delivery ?  Prevenir CF si info confirmée
Client demande RXP ?', null, 'CF 10/07: Pouvez-vous nous adresser :

La réclamation du client
La demande d’indemnisation à WSE ;
Le montant du remboursement dés que vous en avez connaissance ;', 'Coste Fermon'),
  ('S_1833154', '2026-06-30 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Casse totale', 'Casse totale — ELLER RYAN — expédition 6919-01-01 00:00:00', 'Colis de 12 endommagé et intégralement jetté par UPS USA.', 'ELLER RYAN', 'che32075@gmail.com', '2516232443', 'États-Unis - Texas - Groupage', '6919-01-01 00:00:00', 'PLANET PROVENCE', '2026-06-12', null, 1302.96, 'UPS', '1ZH9362CA802888460', '', '', '2025-07-08', 12, 765.0, 'https://drive.google.com/drive/folders/16aQ-W2-6dkYbCsfZ4ld8BvmGMe1B5sfa?usp=sharing', 'Non', null, null, '', '2026-07-08', 'TP2635777CA', '', 'Transmis Coste Fermon', null, 0, null, 0, null, '08/07: Mail BO domaine + client OK - 
Recla WS ok
Dossier transmis a CF

16/07: Complément transmis a CF', null, 'En att du retour client + domaine pour savoir si RXP ou remboursement. 
Dossier CF à compléter avec la reponse du client + réaction du domaine', 'Coste Fermon'),
  ('S_7488', '2026-06-30 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Casse partielle', 'Casse partielle — CANTAR	JOSEPH / JENNY — expédition 7488', 'Colis perdu partiellement endomagé entre notre entrpot de New York et le destinataire final.', 'CANTAR	JOSEPH / JENNY', 'jcantar@virginiatrialfirm.com', '8043148932', 'États-Unis - Virginie - Groupage', '7488', 'CHATEAU DE LA GAUDE', '2026-06-23', null, 227.53, 'UPS', '1Z8593X5A818957047', '', '', '2026-07-08', 2, 0, 'https://drive.google.com/drive/folders/128pKKRHlqg1113oxRisqbcnrUDqh0A4f?usp=sharing', 'Non', null, null, '', '2026-07-08', '', '', 'Transmis Coste Fermon', null, 0, null, 0, null, '08/07: Dossier transmis a CF - Mail BO domaine + Client ok
Mail envoyé a WS + Ian pour connaitre létat des bouteilles restantes 

08/07: Aless a recu le colis Demande de photos cartons + bouteille

16/07: Clim WS complétée + Capture transmise a CF.
Toujours en attente de photos d''Aless

28/07: 2 bottles of Garance Rosé 2023 broken. Client ask for a reshipment - Verif avec le domaine si bouteille dispo + demande de facture - En att rep', null, '30/07: Le domaine prépare la facture + RXP 
RXP prevue 03/08', 'Coste Fermon'),
  ('S_7255', '2026-06-30 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Casse totale', 'Casse totale — HAMMILL ANDREW — expédition 7255', 'Colis en RTS suite a un dommage.', 'HAMMILL ANDREW', 'andrew.hammill@yahoo.com', '9098335713', 'États-Unis - Caroline du Nord - Groupage', '7255', 'LES CAVES DU LOUVRE', '2026-06-22', null, 152.65, 'UPS', '1Z8593X5A810126780', '', '', '2026-07-08', 0, 0, 'https://drive.google.com/drive/folders/1VFjM2WI6cvXe5zN2qxW5iJzhrmjiGl5Y?usp=sharing', '', null, null, '', null, '', '', 'Transmis Coste Fermon', null, 0, null, 0, null, '08/07: Colis refusé par le destinataire - En RTS
Mail envoyé a WS + Ian pour avoir plus d''info. 

08/07: Aless a recu le colis - 1 bouteille rescapée - 
Demande de photos cartons + bouteille', null, '', 'Coste Fermon'),
  ('S_7841', '2026-07-27 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Casse totale', 'Casse totale — MARSH ADAM — expédition 7841', 'The parcel has been damaged and all merchandise has been discarded.', 'MARSH ADAM', 'adam.l.marsh@gmail.com', '2488956969', 'États-Unis - New York - Groupage', '7841', 'CHATEAU PARADIS', '2026-07-07', null, 118.33, 'UPS', '1Z8593X5A821029141', '', '', '2026-07-27', 0, 248.33, 'https://drive.google.com/drive/folders/1Wga74RElJKZd1VvJS1ovuPLX9xujFJPx?usp=sharing', '', null, null, '', '2026-07-27', 'TP2636039CA', '', 'Transmis Coste Fermon', null, 0, null, 0, null, '09/07 Sarah: Sinistre découvert - Mail WS Envoyé
27/07/ cLAIM ws + cf FAIT', null, '31/07: CF demande :
Les réserves du destinataire
Les photos de la marchandise endommagée,
La réclamation du domaine,
Le montant du remboursement versé par le transporteur, dès que vous en aurez connaissance.', 'Coste Fermon'),
  ('S_8019', '2026-07-27 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Perte', 'Perte — EASTERDAY ALLY — expédition 8019', 'WS considère que le colis comme étant perdu', 'EASTERDAY ALLY', 'ally.easterday@gmail.com', '8644977343', 'États-Unis - Caroline du Sud - Groupage', '8019', 'O CHATEAU PICKING', '2026-07-07', null, 473.0, 'UPS', '1Z8593X5A810788502', '', '', '2026-07-27', 12, 673.0, 'https://drive.google.com/drive/folders/1uUf00DyO16liOttm68_yxwMqzfqcC_iu?usp=sharing', '', null, null, '', '2026-07-27', '', '', 'Transmis Coste Fermon', null, 0, null, 0, null, '27/07: WS = Claim a faire
Mail envoyé depuis le BO pour déclarer la perte au client + domaine
Claim WS + CF fait
28/07:Cliente demande le remboursement - Mail envoyé a Laury pour savoir si nous faisons le remboursement ou s''ils s''en chargent - En att repo.', null, 'CF demande: Une déclaration de perte du transporteur ;
La réponse du transporteur à votre demande d’indemnisation ;
La réclamation de votre client ;', 'Coste Fermon'),
  ('S_9229', '2026-07-27 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Casse partielle', 'Casse partielle — DE MONTANGON GUILLAUME — expédition 9229', '1 magnum cassé durant le transport', 'DE MONTANGON GUILLAUME', 'Guillaume.DeMontangon@gmail.com', '679454241', 'France', '9229', 'CHATEAU DE LA GAUDE', '2026-07-15', null, 175.8, 'UPS', '1Z80X8R0DL95250920', '', '', '2026-07-27', 1, 33.6, 'https://drive.google.com/drive/folders/1DCQF0Si6hy3lUgyC0aW59Ua7gqFBcCUj?usp=sharing', '', null, null, '', '2026-07-27', 'TP2636011CA', '', 'Transmis Coste Fermon', null, 0, null, 0, null, '27/07: Eu client au tel, demande RXP si possible 
Domaine au courant
Mail UPS + CF fait 
28/07: Domaine Ok pour la RXP + Demande de facture faite', null, 'CF demande: Le document d’accompagnement,
La demande d’indemnisation faite au transporteur et sa réponse ;
La réclamation de votre client,
Un descriptif et des photos du dommage ; | Quantité au classeur : 1 mag', 'Coste Fermon'),
  ('S_7474', '2026-07-27 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Coulage / fuite', 'Coulage / fuite — WEST NICHOLAS — expédition 7474', 'chateau pommard vivant miccault 2022 avec un bouchon sorti et 2 chateau pommard clos Marey monge 2022avec etiquettes abimées', 'WEST NICHOLAS', 'westni.b@gmail.com', '5418918369', 'États-Unis - Oregon - Groupage', '7474', 'CHATEAU DE POMMARD SAS', '2026-07-07', null, 1160.0, 'UPS', '1Z8593X5A839468849', '', '', '2026-07-27', 3, 197.5, 'https://drive.google.com/drive/folders/1cOhKIAn6djL8CgrTrXpzWurAucgf7gdi?usp=sharing', '', null, null, '', null, '', '', 'Transmis Coste Fermon', null, 0, null, 0, null, '27/07: mail fait a WS pour savoir si on fait une recla ou pas  + 
En att rep de WS pour faire CF - Vu avec flo on fait la RXP - Client + Hugo en copie ok

Eu Hugo au tel, il propose de prendre en charge les bouteilles et nous le transport pour une livraison en Septembre 

28/07: Hugo et le client sont d''accord pour RXP 2 bouteilles en octobre - Pommard offre les bouteilles et nous le transport 

28/07: WeShip demande de remplir une claim au cas ou - Bien penser a inclure les photos', null, '', 'Coste Fermon'),
  ('S_8639', '2026-07-28 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Perte', 'Perte — DELORD TIFFANY — expédition 8639', '', 'DELORD TIFFANY', 'christeldelord@icloud.com', '607156568', 'France', '8639', 'CHAMPAGNE LA MAISON PENET', '2026-06-25', null, 180.0, 'UPS', '1Z80X8R0DL95000575', '', '', '2026-07-28', 12, 180.0, 'https://drive.google.com/drive/folders/16w5p1jlCkwLvCARqrzlKDIFg9GMk7y6G?usp=sharing', '', null, null, '', null, '', '', 'Transmis Coste Fermon', null, 0, null, 0, null, '29/07: Dossier CF monté mais non transmis -
31/07: Dossier CF transmis', null, '', 'Coste Fermon'),
  ('S_9287', '2026-07-29 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Casse partielle', 'Casse partielle — KLEIN LISA — expédition 9287', '1 bouteille cassee Zaello a 12,30€', 'KLEIN LISA', 'lisaklein2018@gmail.com', '2242773400', 'États-Unis - Arizona - Groupage', '9287', 'TERRE DE MISTRAL', '2026-07-20', '2026-07-22', 73.8, 'UPS', '1Z80X8R06899567367', '', '', '2026-07-29', 1, 132.3, 'https://drive.google.com/drive/folders/1Oy7PXSf1G8vi27iik7BEpTVkTf_w9muG?usp=sharing', '', null, null, '', null, '', '', 'Transmis Coste Fermon', null, 0, null, 0, null, '30/07: Bouteille cassée en FM - Faire dossier CF 
Mail UPS fait + Coste en copie
Domaine informé - En att retour

31/07: Dossier CF envoyé
31/07: Recla UPS ok en att du doc d''indemnisation', null, '31/07 CF demande: 
La réclamation du client ou les échanges avec ce dernier concernant le sinistre ;
Avez-vous émis des réserves à réception dans vos locaux ? Si oui nous communiquer la POD ou le bon de livraison afférent ;
La réclamation réalisée auprès du transporteur et son éventuelle réponse ;', 'Coste Fermon'),
  ('S_7323', '2026-07-29 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Perte', 'Perte — PONTARELLI	JACK — expédition 7323', 'Colis perdu par WeShip', 'PONTARELLI	JACK', 'jack.pontarelli@gmail.com', '8478632569', 'États-Unis - Illinois - Groupage', '7323', 'DOMAINE JAS MONGES', '2026-12-06', null, 84.0, 'Autre', 'UDS1403373141', '', '', null, 0, 0, 'https://drive.google.com/drive/folders/11rPjQCUW35-zZtWk3Kg_aKV9KicUSMFd?usp=sharing', '', null, null, '', null, '', '', 'Transmis Coste Fermon', null, 0, null, 0, null, '29/17: Les DA + Les echanges avec WS sont enregistré dans un meme fichier dans le Drive
31/07: dossier transmis a CF', null, '22/07: Tous les clients ont ete contacte pour leur dire nos solutions pour la perte des vins', 'Coste Fermon'),
  ('S_7407', '2026-07-29 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Perte', 'Perte — PONTARELLI	JONATHAN — expédition 7407', 'Colis perdu par WeShip', 'PONTARELLI	JONATHAN', 'jack.pontarelli@gmail.com', '8478632569', 'États-Unis - Illinois - Groupage', '7407', 'FAMILLE NEGREL SAS', '2026-06-18', null, 109.17, 'Autre', 'UDS1403379141', '', '', null, 0, 0, 'https://drive.google.com/drive/folders/11rPjQCUW35-zZtWk3Kg_aKV9KicUSMFd?usp=sharing', '', null, null, '', null, '', '', 'Transmis Coste Fermon', null, 0, null, 0, null, '29/17: Les DA + Les echanges avec WS sont enregistré dans un meme fichier dans le Drive
31/07: dossier transmis a CF', null, '22/07: Tous les clients ont ete contacte pour leur dire nos solutions pour la perte des vins', 'Coste Fermon'),
  ('S_7387', '2026-07-29 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Perte', 'Perte — Allen Anika — expédition 7387', 'Colis perdu par WeShip', 'Allen Anika', 'ktbeard@gmail.com', '2707929366', 'États-Unis - Illinois - Groupage', '7387', 'DOMAINE JAS MONGES', '2026-06-18', null, 152.0, 'Autre', 'UDS1403375501', '', '', null, 0, 0, 'https://drive.google.com/drive/folders/11rPjQCUW35-zZtWk3Kg_aKV9KicUSMFd?usp=sharing', '', null, null, '', null, '', '', 'Transmis Coste Fermon', null, 0, null, 0, null, '29/17: Les DA + Les echanges avec WS sont enregistré dans un meme fichier dans le Drive
31/07: dossier transmis a CF', null, '22/07: Tous les clients ont ete contacte pour leur dire nos solutions pour la perte des vins', 'Coste Fermon'),
  ('S_7464', '2026-07-29 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Perte', 'Perte — beard katie — expédition 7464', 'Colis perdu par WeShip', 'beard katie', 'ktbeard@gmail.com', '2707929366', 'États-Unis - Illinois - Groupage', '7464', 'CHATEAU DE LA VERRERIE', '2026-06-17', null, 179.0, 'Autre', 'UDS1403371531', '', '', null, 0, 0, 'https://drive.google.com/drive/folders/11rPjQCUW35-zZtWk3Kg_aKV9KicUSMFd?usp=sharing', '', null, null, '', null, '', '', 'Transmis Coste Fermon', null, 0, null, 0, null, '29/17: Les DA + Les echanges avec WS sont enregistré dans un meme fichier dans le Drive
31/07: dossier transmis a CF', null, '22/07: Tous les clients ont ete contacte pour leur dire nos solutions pour la perte des vins', 'Coste Fermon'),
  ('S_7263', '2026-07-29 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Perte', 'Perte — Bradley danielle — expédition 7263', 'Colis perdu par WeShip', 'Bradley danielle', 'tnukirk@yahoo.com', '7087525298', 'États-Unis - Illinois - Groupage', '7263', 'LES CAVES DU LOUVRE', '2026-06-12', null, 524.0, 'Autre', 'UDS1403372911 UDS1403372901', '', '', null, 0, 0, 'https://drive.google.com/drive/folders/11rPjQCUW35-zZtWk3Kg_aKV9KicUSMFd?usp=sharing', '', null, null, '', null, '', '', 'Transmis Coste Fermon', null, 0, null, 0, null, '29/17: Les DA + Les echanges avec WS sont enregistré dans un meme fichier dans le Drive
31/07: dossier transmis a CF', null, '22/07: Tous les clients ont ete contacte pour leur dire nos solutions pour la perte des vins', 'Coste Fermon'),
  ('S_7213', '2026-07-29 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Perte', 'Perte — SHAPIRO Russell — expédition 7213', 'Colis perdu par WeShip', 'SHAPIRO Russell', 'rshapiro@lplegal.com', '3123993827', 'États-Unis - Illinois - Groupage', '7213', 'DOMAINE LA BARROCHE', '2026-06-17', null, 543.75, 'Autre', 'UDS1403380891', '', '', null, 0, 0, 'https://drive.google.com/drive/folders/11rPjQCUW35-zZtWk3Kg_aKV9KicUSMFd?usp=sharing', '', null, null, '', null, '', '', 'Transmis Coste Fermon', null, 0, null, 0, null, '29/17: Les DA + Les echanges avec WS sont enregistré dans un meme fichier dans le Drive
31/07: dossier transmis a CF', null, '22/07: Tous les clients ont ete contacte pour leur dire nos solutions pour la perte des vins', 'Coste Fermon'),
  ('S_7441', '2026-07-29 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Perte', 'Perte — ZITO KRISTA — expédition 7441', 'Colis perdu par WeShip', 'ZITO KRISTA', 'KRISTAZITO@HOTMAIL.COM', '4302486992', 'États-Unis - Illinois - Groupage', '7441', 'O CHATEAU', '2026-06-19', null, 117.0, 'Autre', 'UDS1403784551', '', '', null, 0, 0, 'https://drive.google.com/drive/folders/11rPjQCUW35-zZtWk3Kg_aKV9KicUSMFd?usp=sharing', '', null, null, '', null, '', '', 'Transmis Coste Fermon', null, 0, null, 0, null, '29/17: Les DA + Les echanges avec WS sont enregistré dans un meme fichier dans le Drive
31/07: dossier transmis a CF', null, '22/07: Tous les clients ont ete contacte pour leur dire nos solutions pour la perte des vins', 'Coste Fermon'),
  ('S_8742', '2026-07-29 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Perte', 'Perte — MULLIGAN Luke — expédition 8742', 'Perte de un colis de 12 bouteilles', 'MULLIGAN Luke', 'kate@mulliganschemist.com', '874216798990', 'Irlande', '8742', 'CHATEAU DE LA GAUDE', '2026-07-15', null, 1228.8, 'FedEx', '874216798990', '', '', '2026-07-29', 12, 220.8, 'https://drive.google.com/drive/folders/1vmAuLLFf-y3gqEVF-Qo74PLEaBvpZtsU?usp=sharing', '', null, null, '', null, '', '', 'Transmis Coste Fermon', null, 0, null, 0, null, 'Un colis de 12 perdu 12 bottles of the La Gaude Rosé Effervescent Altitude 400
31/07: Transmis CF', null, 'RXP prévu 31/07', 'Coste Fermon'),
  ('S_9010', '2026-07-29 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Casse partielle', 'Casse partielle — GARAY DANIELLE — expédition 9010', 'Arrivé durant le FM. Livré au 5, verif les bouteilles recues', 'GARAY DANIELLE', 'nielagaray@gmail.com', '6313088173', 'États-Unis - New York - Groupage', '9010', 'Fondugues Pradugues - Direct Châteaux', '2026-07-08', '2026-07-21', 181.67, 'UPS', '1Z80X8R06893447579', '', '', '2026-07-29', 5, 274.16, 'https://drive.google.com/drive/folders/1k4gf9t-rQx-SbVZBozAC7yCcrC8shs3d?usp=sharing', '', null, null, '', null, '', '', 'Transmis Coste Fermon', null, 0, null, 0, null, '30/07: Fichier recla UPS recu + Verif en cave ce qu''on a recu pour déclarer le sinistre
31/07: En attente de la liste des bouteiles recues pour remplir le docs UPS.', null, '31/07: Domaine demande RXP + va envoyer la facture', 'Coste Fermon'),
  ('S_8414', '2026-07-29 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Casse partielle', 'Casse partielle — REGALADO KIM — expédition 8414', 'UNE PARTIE DE LENVOI A ETE ENDOMMAGE ET UNE AUTRE PARTIE EST EN RETOUR EXPEDITEUR JAI INFORME LE CLIENT POUR LA CASSE ET NOUS SOMMES ACTUELLEMENT EN ATTENTE DE CONNAITRE QUELLES BOUTEILLES ONT ETE PERDUES - ROBIN', 'REGALADO KIM', 'haydenregalado8@gmail.com', '5037409773', 'États-Unis - Oregon - Groupage', '8414', 'PLANET PROVENCE', '2026-07-20', null, 203.4, 'UPS', '1Z8593X5A829399004', '', '', '2026-07-31', 12, 403.4, 'https://drive.google.com/drive/u/0/folders/1R3Hs0Pdhu5GYS-RSL87hLZNqtPaIq-sS', '', null, null, '', null, '', '', 'Transmis Coste Fermon', null, 0, null, 0, null, '30/07: Pieces ajoutées au dossier - RTS attendu le 31/07 a NY', null, 'UNE PARTIE DE LENVOI A ETE ENDOMMAGE ET UNE AUTRE PARTIE EST EN RETOUR EXPEDITEUR JAI INFORME LE CLIENT POUR LA CASSE ET NOUS SOMMES ACTUELLEMENT EN ATTENTE DE CONNAITRE QUELLES BOUTEILLES ONT ETE PERDUES - ROBIN', 'Coste Fermon'),
  ('S_7817', '2026-07-31 09:00:00+00', 'Transmis Coste Fermon', 'Normal', 'Casse partielle', 'Casse partielle — HETT DAVE ET BETSY — expédition 7817', 'une bouteille BOURGOGNE COTE D’ OR BLANC LES EQUINCES 2022', 'HETT DAVE ET BETSY', 'betsyjhett@gmail.com', '3602815574', 'États-Unis - Washington - Groupage', '7817', 'DOMAINE ANNE BAVARD BROOKS', '2026-07-07', '2026-07-13', 324.0, 'UPS', '1Z8593X5A835553290', '', '', '2026-07-31', 1, 35.0, 'https://drive.google.com/drive/folders/1D1ExmCHHfcbFaxBp9HW6V-5VekQutgq4?usp=sharing', '', null, null, '', null, '', '', 'Transmis Coste Fermon', null, 0, null, 0, null, '31/07: Le client demande un remboursement 
Dossier CF envoyé', null, '', 'Coste Fermon'),
  ('S_8785', '2026-07-27 09:00:00+00', 'Nouveau', 'Normal', 'Casse partielle', 'Casse partielle — SHUTKO BETH — expédition 8785', '', 'SHUTKO BETH', 'shutkobeth04@gmail.com', '8105315112', 'États-Unis - Michigan - Direct', '8785', 'DOMAINE DE LA CITADELLE', '2026-06-30', null, 204.75, 'UPS', '1Z80X8R0DA99658431', '', '', '2026-07-27', 1, 0, 'https://drive.google.com/drive/folders/1WGjrm1SMii9_fO8tMXSgxDI4PZm7iBUd?usp=sharing', '', null, null, '', null, '', '', '', null, 0, null, 0, null, '27/07: UPS déclare une bouteille cassee. 
Mail envoyé au client afin de verifier + Mail récla UPS
31/07: UPS pretend que le colis n''est pas conforme - Reponse envoyée', null, '', 'Coste Fermon'),
  ('S_RXP 8335', now(), 'Nouveau', 'Normal', 'Autre', 'Autre — ANDRE ERIN — expédition RXP 8335', 'PARTIRA SEMAINE PRO

08/07 SARAH: BDT OK

28/07 Sarah: Colis non scanné depuis le 17/07 - En att retour UPS 
30/07: UPS affirme que le colis a bien été livré avec une preuve de livraison 
2 bandol rouge 18,3€ la bouteille', 'ANDRE ERIN', '', '', '', 'RXP 8335', 'DOMAINE PIERACCI', null, null, 164.16, '', '1Z80X8R06899158693', '', '', null, 0, 0, '', '', null, null, '', null, '', '', '', null, 0, null, 0, null, '31/07: UPS ouvre une enquete', null, '', 'Coste Fermon'),
  ('S_7039', '2026-07-27 09:00:00+00', 'Nouveau', 'Normal', 'Perte', 'Perte — HARRIS SHELBY AND STEPHANIE — expédition 7039', '', 'HARRIS SHELBY AND STEPHANIE', 'SRharris1128@gmail.com', '5103552728', 'États-Unis - Colorado - Groupage', '7039', 'LES CAVES BIANCHI', '2026-06-22', null, 1194.0, 'UPS', '1Z8593X5A823427323', '', '', '2026-07-27', 6, 0, '', '', null, null, '', null, '', '', '', null, 0, null, 0, null, '27/07: Mail envoyé au client afin de confirmer ou pas la reception de tous les colis', null, '', 'Coste Fermon')
on conflict (ref) do update set
  status = excluded.status, priority = excluded.priority, category = excluded.category,
  title = excluded.title, description = excluded.description,
  client_nom = excluded.client_nom, client_email = excluded.client_email,
  client_tel = excluded.client_tel, pays = excluded.pays,
  shipping_ref = excluded.shipping_ref, adherent = excluded.adherent,
  date_expedition = excluded.date_expedition, date_livraison = excluded.date_livraison,
  valeur_commande = excluded.valeur_commande, carrier = excluded.carrier,
  tracking_number = excluded.tracking_number, lien_suivi = excluded.lien_suivi,
  lien_transporteur = excluded.lien_transporteur, date_incident = excluded.date_incident,
  nb_bouteilles = excluded.nb_bouteilles, montant_estime = excluded.montant_estime,
  lien_drive = excluded.lien_drive, reserves = excluded.reserves,
  lrar_le = excluded.lrar_le, ar_le = excluded.ar_le,
  reponse_transporteur = excluded.reponse_transporteur,
  cf_declaration = excluded.cf_declaration, cf_dossier = excluded.cf_dossier,
  cf_interlocuteur = excluded.cf_interlocuteur, cf_statut = excluded.cf_statut,
  cf_relance = excluded.cf_relance, montant_propose = excluded.montant_propose,
  date_accord = excluded.date_accord, montant_recupere = excluded.montant_recupere,
  date_versement = excluded.date_versement, prochaine_action = excluded.prochaine_action,
  action_echeance = excluded.action_echeance, notes = excluded.notes;

-- Un dossier clôturé, indemnisé, refusé ou non assuré n'est plus « ouvert ».
update public.claims set closed_at = coalesce(closed_at, created_at)
where status in ('Clôturé', 'Refusé / Sans suite', 'Indemnisé', 'Non - Assuré') and closed_at is null;

select count(*) || ' dossiers dans Planet''Claim' as resultat from public.claims;
